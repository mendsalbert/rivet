import { addedLines, parseUnifiedDiff } from "./parse-diff";
import type { Finding, ReviewEvent, Verdict } from "./types";

function push(
  findings: Finding[],
  finding: Omit<Finding, "id">,
) {
  findings.push({ id: crypto.randomUUID(), ...finding });
}

export function inspectDiff(diff: string): { findings: Finding[]; verdict: Verdict; summary: string } {
  const files = parseUnifiedDiff(diff);
  const added = addedLines(files);
  const findings: Finding[] = [];
  const changedPaths = files.map((file) => file.path);
  const hasTest = changedPaths.some((path) => /test|spec/i.test(path));
  const sourceChanged = changedPaths.some((path) => !/test|spec/i.test(path));

  for (const line of added) {
    const text = line.text;
    const file = line.file;
    const at = line.line;

    if (/STRIPE_SECRET_KEY|AWS_SECRET|PRIVATE_KEY|api[_-]?key/i.test(text) && /json\(|return|console/.test(text)) {
      push(findings, {
        severity: "critical",
        file,
        line: at,
        title: "Secret value leaves the server",
        body: "This added line returns or logs a secret. Anyone who can hit the route gets production credentials.",
        suggestion: "Never serialize env secrets into a response. Return a checkout URL or a client-safe session id only.",
      });
    }

    if (/constructEvent|stripe-signature/.test(diff) === false && /stripe\.checkout|webhooks/i.test(text)) {
      // handled below with file-level check
    }

    if (/\bany\b/.test(text) && /:\s*any\b/.test(text)) {
      push(findings, {
        severity: "nit",
        file,
        line: at,
        title: "Payload typed as any",
        body: "The request body is `any`, so the checkout session is built from untrusted JSON with no shape check.",
        suggestion: "Parse the body with Zod (or similar) before it touches Stripe.",
      });
    }

    if (/searchParams\.get\(\s*["']userId["']\s*\)/.test(text)) {
      push(findings, {
        severity: "critical",
        file,
        line: at,
        title: "Caller chooses the user id",
        body: "The handler trusts `userId` from the query string. That is an IDOR: any client can create or inspect another user's checkout.",
        suggestion: "Take the user from the session (Neon Auth `getSession()`), never from the URL.",
      });
    }

    if (/SELECT[\s\S]*\+\s*userId|WHERE[\s\S]*'\s*\+\s*/i.test(text) || /"SELECT[\s\S]*"\s*\+\s*/.test(text)) {
      push(findings, {
        severity: "critical",
        file,
        line: at,
        title: "SQL is concatenated from request data",
        body: "The query is built with string addition. `userId` is attacker-controlled, so this is a straight SQL injection.",
        suggestion: "Use a parameterized query through Drizzle or `pg` (`$1` placeholders).",
      });
    }

    if (/console\.log\(/.test(text) && /payload|password|email|token/i.test(text)) {
      push(findings, {
        severity: "warning",
        file,
        line: at,
        title: "Checkout payload logged in full",
        body: "The added log dumps the request body. Emails, line items, and metadata will land in log drains.",
        suggestion: "Log a request id, not the payload.",
      });
    }

    if (/\bcatch\s*\(/.test(text)) {
      push(findings, {
        severity: "warning",
        file,
        line: at,
        title: "Empty catch swallows checkout failures",
        body: "Stripe or database errors disappear. The handler then returns `{ ok: true }`, so the client thinks payment started.",
        suggestion: "Return a 500, log the error, and do not mark the order as received.",
      });
    }

    if (/localhost:3000|localhost:5432/.test(text)) {
      push(findings, {
        severity: "warning",
        file,
        line: at,
        title: "Hard-coded localhost URL",
        body: "Success and database URLs point at localhost. This will break the moment the agent runs anywhere but a laptop.",
        suggestion: "Read the origin from env (`APP_URL`) and talk to Postgres through `DATABASE_URL`, not HTTP to 5432.",
      });
    }

    if (/__html|dangerouslySetInnerHTML/.test(text) || /<script>/i.test(text)) {
      push(findings, {
        severity: "critical",
        file,
        line: at,
        title: "HTML injection in refund receipt",
        body: "The refund helper returns a script tag via `__html`. If a React client renders it, this is stored XSS.",
        suggestion: "Return structured data. Never ship HTML from an order helper.",
      });
    }

    if (/TODO|FIXME/.test(text)) {
      push(findings, {
        severity: "nit",
        file,
        line: at,
        title: "TODO shipped in the patch",
        body: "The comment admits the database client is missing, then proceeds to call a fake HTTP query endpoint instead.",
      });
    }
  }

  const checkout = files.find((file) => file.path.includes("checkout"));
  if (checkout) {
    const addedText = checkout.lines.filter((l) => l.type === "add").map((l) => l.text).join("\n");
    const removedText = checkout.lines.filter((l) => l.type === "del").map((l) => l.text).join("\n");
    if (/constructEvent|stripe-signature/.test(removedText) && !/constructEvent/.test(addedText)) {
      push(findings, {
        severity: "critical",
        file: checkout.path,
        line: addedLines([checkout])[0]?.line ?? 1,
        title: "Webhook signature check removed",
        body: "The patch deletes `stripe.webhooks.constructEvent` and accepts JSON from anyone. That is how you get forged `checkout.session.completed` events.",
        suggestion: "Keep signature verification. If this is a client checkout route, it still must not trust `userId` from the query string.",
      });
    }
  }

  if (sourceChanged && !hasTest) {
    push(findings, {
      severity: "warning",
      file: changedPaths[0] ?? "unknown",
      line: null,
      title: "No test file in the patch",
      body: "Checkout and refund behavior changed without a test. The IDOR and the empty catch would both have been caught by one request-level test.",
      suggestion: "Add a route test that forbids a foreign `userId` and rejects unsigned webhook bodies.",
    });
  }

  const unique = dedupe(findings);
  const verdict = verdictFor(unique);
  const summary = summaryFor(unique, files.length, verdict);
  return { findings: unique, verdict, summary };
}

function dedupe(findings: Finding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.severity}:${finding.title}:${finding.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verdictFor(findings: Finding[]): Verdict {
  if (findings.some((finding) => finding.severity === "critical")) return "request_changes";
  if (findings.some((finding) => finding.severity === "warning")) return "comment";
  return "approve";
}

function summaryFor(findings: Finding[], fileCount: number, verdict: Verdict) {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  if (verdict === "request_changes") {
    return `Walked ${fileCount} file${fileCount === 1 ? "" : "s"}. ${critical} critical, ${warning} warning. Do not merge until the caller identity and any secret leakage are fixed.`;
  }
  if (verdict === "comment") {
    return `Walked ${fileCount} file${fileCount === 1 ? "" : "s"}. No criticals, ${warning} warning${warning === 1 ? "" : "s"} worth fixing before merge.`;
  }
  return `Walked ${fileCount} file${fileCount === 1 ? "" : "s"}. Nothing blocking.`;
}

export async function* runHeuristicAgent(diff: string): AsyncGenerator<ReviewEvent> {
  yield { type: "status", phase: "reading", detail: "Parsing the unified diff." };
  const files = parseUnifiedDiff(diff);
  yield {
    type: "status",
    phase: "walking",
    detail: `${files.length} file${files.length === 1 ? "" : "s"}, ${addedLines(files).length} added lines.`,
  };

  const { findings, verdict, summary } = inspectDiff(diff);
  for (const finding of findings) {
    yield { type: "status", phase: "citing", detail: finding.file };
    yield { type: "finding", finding };
  }

  yield { type: "complete", summary, verdict };
}
