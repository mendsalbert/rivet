import { inspectDiff } from "./heuristic";
import { SAMPLE_DIFF, SAMPLE_TITLE } from "./sample";
import type { Review } from "./types";
import { completeReview, createReview, getReview, markRunning, saveFinding } from "../store";

export async function ensureSampleReview(userId: string): Promise<Review> {
  const id = `sample-${userId}`;
  const existing = await getReview(id, userId);
  if (existing?.status === "complete") return existing;

  const inspected = inspectDiff(SAMPLE_DIFF);
  if (!existing) {
    await createReview({
      id,
      userId,
      title: SAMPLE_TITLE,
      sourceType: "paste",
      sourceUrl: null,
      repo: "acme/checkout",
      prNumber: 1842,
      diffKey: null,
      diffText: SAMPLE_DIFF,
    });
  }

  await markRunning(id);
  for (const [index, finding] of inspected.findings.entries()) {
    await saveFinding(id, finding, index + 1);
  }
  await completeReview(id, inspected.summary, inspected.verdict);
  return (await getReview(id, userId))!;
}
