import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { join } from "node:path";
import { SignJWT } from "jose";
import type { Finding, Verdict } from "@/lib/review/types";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const UA = "rivet-review-agent";

export function isGithubAppConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      (process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_PATH),
  );
}

export function githubAppSlug() {
  return process.env.GITHUB_APP_SLUG || "rivet-review";
}

function privateKeyPem() {
  const inline = process.env.GITHUB_APP_PRIVATE_KEY;
  if (inline) return inline.replace(/\\n/g, "\n");
  const relative = process.env.GITHUB_APP_PRIVATE_KEY_PATH || "rivet-github-app.pem";
  return readFileSync(join(process.cwd(), relative), "utf8");
}

export async function createAppJwt() {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) throw new Error("GITHUB_APP_ID is not set.");
  const key = createPrivateKey(privateKeyPem());
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(appId)
    .sign(key);
}

async function appFetch(path: string, init: RequestInit = {}) {
  const jwt = await createAppJwt();
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": UA,
      "X-GitHub-Api-Version": API_VERSION,
      Authorization: `Bearer ${jwt}`,
      ...(init.headers ?? {}),
    },
  });
  return response;
}

export async function getInstallationToken(installationId: number) {
  const response = await appFetch(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Could not mint installation token (${response.status}).`);
  }
  const data = (await response.json()) as { token: string };
  return data.token;
}

export async function getRepoInstallation(owner: string, repo: string) {
  const response = await appFetch(`/repos/${owner}/${repo}/installation`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not look up installation for ${owner}/${repo} (${response.status}).`);
  }
  const data = (await response.json()) as { id: number };
  return data.id;
}

export async function installationHeaders(token: string, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "User-Agent": UA,
    "X-GitHub-Api-Version": API_VERSION,
  } satisfies HeadersInit;
}

export async function fetchPullRequestWithToken(
  owner: string,
  repo: string,
  number: number,
  token: string,
) {
  const base = `${API}/repos/${owner}/${repo}/pulls/${number}`;
  const headers = await installationHeaders(token);
  const [metaRes, diffRes] = await Promise.all([
    fetch(base, { headers }),
    fetch(base, { headers: { ...headers, Accept: "application/vnd.github.diff" } }),
  ]);

  if (!metaRes.ok || !diffRes.ok) {
    throw new Error(`GitHub PR fetch failed (${metaRes.status}/${diffRes.status}).`);
  }

  const meta = (await metaRes.json()) as {
    title: string;
    html_url: string;
    head: { sha: string };
    draft?: boolean;
  };
  const diff = await diffRes.text();

  return {
    title: meta.title || `PR #${number}`,
    sourceUrl: meta.html_url,
    repo: `${owner}/${repo}`,
    prNumber: number,
    commitSha: meta.head.sha,
    draft: Boolean(meta.draft),
    diff,
  };
}

function reviewEvent(verdict: Verdict): "APPROVE" | "REQUEST_CHANGES" | "COMMENT" {
  if (verdict === "approve") return "APPROVE";
  if (verdict === "request_changes") return "REQUEST_CHANGES";
  return "COMMENT";
}

function formatFinding(finding: Finding) {
  const bits = [
    `**${finding.title}** · \`${finding.severity}\``,
    "",
    finding.body,
  ];
  if (finding.suggestion) {
    bits.push("", `_Suggestion:_ ${finding.suggestion}`);
  }
  return bits.join("\n");
}

function buildReviewBody(summary: string, findings: Finding[], appUrl?: string) {
  const lines = [`### Rivet review`, "", summary];
  if (findings.length) {
    lines.push("", `**${findings.length} finding${findings.length === 1 ? "" : "s"}**`);
    for (const finding of findings.slice(0, 20)) {
      const loc =
        finding.line != null ? `\`${finding.file}:${finding.line}\`` : `\`${finding.file}\``;
      lines.push(`- **${finding.severity}** ${loc} — ${finding.title}`);
    }
  }
  if (appUrl) {
    lines.push("", `— [Open in Rivet](${appUrl})`);
  }
  return lines.join("\n");
}

export async function postPullRequestReview(input: {
  token: string;
  owner: string;
  repo: string;
  number: number;
  commitId: string;
  summary: string;
  verdict: Verdict;
  findings: Finding[];
  reviewUrl?: string;
}) {
  const comments = input.findings
    .filter((f) => f.line != null && f.file)
    .slice(0, 30)
    .map((finding) => ({
      path: finding.file.replace(/^\.\//, ""),
      line: finding.line as number,
      side: "RIGHT" as const,
      body: formatFinding(finding),
    }));

  const body = {
    commit_id: input.commitId,
    body: buildReviewBody(input.summary, input.findings, input.reviewUrl),
    event: reviewEvent(input.verdict),
    comments,
  };

  const headers = {
    ...(await installationHeaders(input.token)),
    "Content-Type": "application/json",
  };

  let response = await fetch(
    `${API}/repos/${input.owner}/${input.repo}/pulls/${input.number}/reviews`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );

  // Line anchors are picky; retry as a summary-only review if comments fail.
  if (!response.ok && comments.length > 0) {
    response = await fetch(
      `${API}/repos/${input.owner}/${input.repo}/pulls/${input.number}/reviews`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          commit_id: input.commitId,
          body: buildReviewBody(input.summary, input.findings, input.reviewUrl),
          event: body.event,
        }),
      },
    );
  }

  // Own-PR / bot limits: APPROVE and REQUEST_CHANGES can 422 — fall back to COMMENT.
  if (!response.ok && body.event !== "COMMENT") {
    response = await fetch(
      `${API}/repos/${input.owner}/${input.repo}/pulls/${input.number}/reviews`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          commit_id: input.commitId,
          body: buildReviewBody(input.summary, input.findings, input.reviewUrl),
          event: "COMMENT",
        }),
      },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to post PR review (${response.status}): ${text}`);
  }

  return response.json();
}

export async function updateAppWebhook(url: string, secret: string) {
  const response = await appFetch("/app/hook/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      content_type: "json",
      secret,
      insecure_ssl: "0",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not update app webhook (${response.status}): ${text}`);
  }
  return response.json();
}

export async function getAppWebhook() {
  const response = await appFetch("/app/hook/config");
  if (!response.ok) return null;
  return response.json() as Promise<{ url: string; active?: boolean }>;
}
