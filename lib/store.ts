import { desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "./db/client";
import { findings, reviews } from "./db/schema";
import type { Finding, Review, ReviewStatus, SourceType, Verdict } from "./review/types";

type ReviewRow = {
  id: string;
  userId: string;
  title: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  repo: string | null;
  prNumber: number | null;
  status: ReviewStatus;
  summary: string | null;
  verdict: Verdict | null;
  diffKey: string | null;
  diffText: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Memory = {
  reviews: Map<string, ReviewRow>;
  findings: Map<string, Finding[]>;
};

const globalStore = globalThis as typeof globalThis & { __rivet?: Memory };

function memory(): Memory {
  if (!globalStore.__rivet) {
    globalStore.__rivet = { reviews: new Map(), findings: new Map() };
  }
  return globalStore.__rivet;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function asReview(row: ReviewRow, items: Finding[]): Review {
  return { ...row, findings: items };
}

export async function createReview(input: {
  id: string;
  userId: string;
  title: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  repo: string | null;
  prNumber: number | null;
  diffKey: string | null;
  diffText: string;
}): Promise<Review> {
  const row: ReviewRow = {
    ...input,
    status: "queued",
    summary: null,
    verdict: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  const db = getDb();
  if (db && isDatabaseConfigured()) {
    await db.insert(reviews).values({
      id: row.id,
      userId: row.userId,
      title: row.title,
      sourceType: row.sourceType,
      sourceUrl: row.sourceUrl,
      repo: row.repo,
      prNumber: row.prNumber,
      status: row.status,
      diffKey: row.diffKey,
      diffText: row.diffText,
    });
  } else {
    memory().reviews.set(row.id, row);
    memory().findings.set(row.id, []);
  }

  return asReview(row, []);
}

export async function getReview(id: string, userId: string): Promise<Review | null> {
  const review = await getReviewById(id);
  if (!review) return null;
  if (review.userId === userId) return review;
  // GitHub App reviews are owned by the installation, not a Neon Auth user.
  if (review.userId.startsWith("github-app:")) return review;
  return null;
}

export async function getReviewById(id: string): Promise<Review | null> {
  const db = getDb();
  if (db && isDatabaseConfigured()) {
    const [row] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
    if (!row) return null;
    const items = await db
      .select()
      .from(findings)
      .where(eq(findings.reviewId, id));
    return asReview(
      {
        id: row.id,
        userId: row.userId,
        title: row.title,
        sourceType: row.sourceType as SourceType,
        sourceUrl: row.sourceUrl,
        repo: row.repo,
        prNumber: row.prNumber,
        status: row.status as ReviewStatus,
        summary: row.summary,
        verdict: (row.verdict as Verdict | null) ?? null,
        diffKey: row.diffKey,
        diffText: row.diffText,
        createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
        completedAt: toIso(row.completedAt),
      },
      items
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: item.id,
          severity: item.severity as Finding["severity"],
          file: item.file,
          line: item.line,
          title: item.title,
          body: item.body,
          suggestion: item.suggestion ?? undefined,
        })),
    );
  }

  const row = memory().reviews.get(id);
  if (!row) return null;
  return asReview(row, memory().findings.get(id) ?? []);
}

export async function listReviews(userId: string): Promise<Review[]> {
  const db = getDb();
  if (db && isDatabaseConfigured()) {
    const rows = await db
      .select()
      .from(reviews)
      .where(eq(reviews.userId, userId))
      .orderBy(desc(reviews.createdAt))
      .limit(40);
    return rows.map((row) =>
      asReview(
        {
          id: row.id,
          userId: row.userId,
          title: row.title,
          sourceType: row.sourceType as SourceType,
          sourceUrl: row.sourceUrl,
          repo: row.repo,
          prNumber: row.prNumber,
          status: row.status as ReviewStatus,
          summary: row.summary,
          verdict: (row.verdict as Verdict | null) ?? null,
          diffKey: row.diffKey,
          diffText: row.diffText,
          createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
          completedAt: toIso(row.completedAt),
        },
        [],
      ),
    );
  }

  return [...memory().reviews.values()]
    .filter((row) => row.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((row) => asReview(row, memory().findings.get(row.id) ?? []));
}

export async function saveFinding(reviewId: string, finding: Finding, sortOrder: number) {
  const db = getDb();
  if (db && isDatabaseConfigured()) {
    await db.insert(findings).values({
      id: finding.id,
      reviewId,
      severity: finding.severity,
      file: finding.file,
      line: finding.line,
      title: finding.title,
      body: finding.body,
      suggestion: finding.suggestion,
      sortOrder,
    });
    return;
  }

  const items = memory().findings.get(reviewId) ?? [];
  items.push(finding);
  memory().findings.set(reviewId, items);
}

export async function markRunning(id: string) {
  await patchReview(id, { status: "running" });
}

export async function completeReview(
  id: string,
  summary: string,
  verdict: Verdict,
) {
  await patchReview(id, {
    status: "complete",
    summary,
    verdict,
    completedAt: new Date().toISOString(),
  });
}

export async function failReview(id: string, summary: string) {
  await patchReview(id, {
    status: "failed",
    summary,
    completedAt: new Date().toISOString(),
  });
}

async function patchReview(
  id: string,
  patch: Partial<
    Pick<ReviewRow, "status" | "summary" | "verdict" | "completedAt">
  >,
) {
  const db = getDb();
  if (db && isDatabaseConfigured()) {
    await db
      .update(reviews)
      .set({
        status: patch.status,
        summary: patch.summary,
        verdict: patch.verdict,
        completedAt: patch.completedAt ? new Date(patch.completedAt) : undefined,
      })
      .where(eq(reviews.id, id));
    return;
  }

  const row = memory().reviews.get(id);
  if (!row) return;
  memory().reviews.set(id, { ...row, ...patch });
}
