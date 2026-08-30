import { createHmac, timingSafeEqual } from "node:crypto";
import {
  fetchPullRequestWithToken,
  getInstallationToken,
  postPullRequestReview,
} from "@/lib/github-app";
import { runReviewAgent } from "@/lib/review/agent";
import type { Finding, Verdict } from "@/lib/review/types";
import { isStorageConfigured, uploadDiff } from "@/lib/storage";
import { completeReview, createReview, failReview, markRunning, saveFinding } from "@/lib/store";

const HANDLED = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

export function verifyGithubSignature(rawBody: string, signature: string | null) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`, "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

type PullRequestPayload = {
  action: string;
  installation?: { id: number };
  repository: {
    name: string;
    owner: { login: string };
    full_name: string;
  };
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    draft?: boolean;
    head: { sha: string };
  };
};

export function shouldHandlePullRequest(payload: PullRequestPayload) {
  if (!HANDLED.has(payload.action)) return false;
  if (payload.pull_request.draft && payload.action !== "ready_for_review") return false;
  return Boolean(payload.installation?.id);
}

export async function processPullRequestWebhook(payload: PullRequestPayload) {
  const installationId = payload.installation!.id;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const number = payload.pull_request.number;
  const userId = `github-app:${installationId}`;

  const token = await getInstallationToken(installationId);
  const pr = await fetchPullRequestWithToken(owner, repo, number, token);

  if (!pr.diff.trim()) {
    await postPullRequestReview({
      token,
      owner,
      repo,
      number,
      commitId: pr.commitSha,
      summary:
        "No file changes in this pull request, so Rivet has nothing to review. Push a commit that modifies files, then Rivet will run again.",
      verdict: "comment",
      findings: [],
    });
    return { reviewId: null, findings: 0, verdict: "comment" as const, skipped: "empty_diff" };
  }

  const reviewId = crypto.randomUUID();
  const diffKey = isStorageConfigured() ? `${userId}/${reviewId}.diff` : null;
  if (diffKey) await uploadDiff(diffKey, pr.diff);

  await createReview({
    id: reviewId,
    userId,
    title: pr.title,
    sourceType: "github_pr",
    sourceUrl: pr.sourceUrl,
    repo: pr.repo,
    prNumber: pr.prNumber,
    diffKey,
    diffText: pr.diff,
  });

  await markRunning(reviewId);

  const findings: Finding[] = [];
  let summary = "Review complete.";
  let verdict: Verdict = "comment";
  let order = 0;

  try {
    for await (const event of runReviewAgent(pr.diff)) {
      if (event.type === "finding") {
        order += 1;
        const finding = { ...event.finding, id: crypto.randomUUID() };
        findings.push(finding);
        await saveFinding(reviewId, finding, order);
      }
      if (event.type === "complete") {
        summary = event.summary;
        verdict = event.verdict;
      }
      if (event.type === "error") {
        throw new Error(event.message);
      }
    }

    await completeReview(reviewId, summary, verdict);

    const appBase = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    await postPullRequestReview({
      token,
      owner,
      repo,
      number,
      commitId: pr.commitSha,
      summary,
      verdict,
      findings,
      reviewUrl: appBase ? `${appBase.replace(/\/$/, "")}/reviews/${reviewId}` : undefined,
    });

    return { reviewId, findings: findings.length, verdict };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review failed";
    await failReview(reviewId, message);
    try {
      await postPullRequestReview({
        token,
        owner,
        repo,
        number,
        commitId: pr.commitSha,
        summary: `Rivet could not finish this review: ${message}`,
        verdict: "comment",
        findings: [],
      });
    } catch {
      // ignore secondary post failure
    }
    throw error;
  }
}
