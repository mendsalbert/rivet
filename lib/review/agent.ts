import { inspectDiff, runHeuristicAgent } from "./heuristic";
import type { Finding, ReviewEvent, Verdict } from "./types";

export function isAiConfigured() {
  return Boolean(process.env.NEON_AI_GATEWAY_TOKEN);
}

const SYSTEM = `You are Rivet, a senior code-review agent.
You review the unified diff only. You do not summarize the PR description.
Cite the file and line of every finding. Prefer fewer, higher-signal comments.
Severity:
- critical: authz bypass, injection, secret leakage, XSS, forged webhooks
- warning: real bugs, swallowed errors, missing tests, hardcoded localhost
- nit: typing, TODOs, naming
Call reportFinding for each issue. Call finishReview exactly once when done.
If the patch is clean, call finishReview with verdict "approve" and no findings.`;

export async function* runReviewAgent(diff: string): AsyncGenerator<ReviewEvent> {
  if (!isAiConfigured()) {
    yield* runHeuristicAgent(diff);
    return;
  }

  try {
    yield* runModelAgent(diff);
  } catch (error) {
    yield {
      type: "status",
      phase: "fallback",
      detail: error instanceof Error ? error.message : "Model unavailable, walking the patch locally.",
    };
    yield* runHeuristicAgent(diff);
  }
}

async function* runModelAgent(diff: string): AsyncGenerator<ReviewEvent> {
  const { neon } = await import("@neon/ai-sdk-provider");
  const { streamText, tool, stepCountIs } = await import("ai");
  const { z } = await import("zod");

  yield { type: "status", phase: "reading", detail: "Sending the patch to the review agent." };

  const collected: Finding[] = [];
  let summary: string | null = null;
  let verdict: Verdict | null = null;

  const result = streamText({
    model: neon("claude-sonnet-4-6"),
    system: SYSTEM,
    prompt: truncateDiff(diff),
    tools: {
      reportFinding: tool({
        description: "Record one review finding tied to a file and line.",
        inputSchema: z.object({
          severity: z.enum(["critical", "warning", "nit"]),
          file: z.string(),
          line: z.number().nullable(),
          title: z.string(),
          body: z.string(),
          suggestion: z.string().optional(),
        }),
        execute: async (input) => {
          collected.push({
            id: `m-${collected.length + 1}`,
            ...input,
          });
          return { recorded: true };
        },
      }),
      finishReview: tool({
        description: "Close the review with a verdict and a short summary.",
        inputSchema: z.object({
          summary: z.string(),
          verdict: z.enum(["approve", "comment", "request_changes"]),
        }),
        execute: async (input) => {
          summary = input.summary;
          verdict = input.verdict;
          return { recorded: true };
        },
      }),
    },
    stopWhen: stepCountIs(10),
    experimental_telemetry: { isEnabled: false },
  });

  const seen = new Set<string>();
  for await (const part of result.fullStream) {
    if (part.type === "tool-call" && part.toolName === "reportFinding") {
      const input = "input" in part ? (part.input as Finding) : null;
      if (!input?.title) continue;
      const key = `${input.title}:${input.file}:${input.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      yield { type: "status", phase: "citing", detail: input.file };
      yield {
        type: "finding",
        finding: {
          id: `m-${seen.size}`,
          severity: input.severity,
          file: input.file,
          line: input.line,
          title: input.title,
          body: input.body,
          suggestion: input.suggestion,
        },
      };
    }
  }

  if (!verdict || collected.length === 0) {
    const inspected = inspectDiff(diff);
    if (collected.length === 0) {
      for (const finding of inspected.findings) {
        yield { type: "finding", finding };
      }
    }
    yield {
      type: "complete",
      summary: summary ?? inspected.summary,
      verdict: verdict ?? inspected.verdict,
    };
    return;
  }

  yield { type: "complete", summary: summary ?? "Review complete.", verdict };
}

function truncateDiff(diff: string) {
  const limit = 70_000;
  if (diff.length <= limit) return diff;
  return `${diff.slice(0, limit)}\n\n[truncated]`;
}
