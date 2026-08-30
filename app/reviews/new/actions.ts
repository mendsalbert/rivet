"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { fetchGithubPullRequest } from "@/lib/github";
import { SAMPLE_DIFF, SAMPLE_TITLE } from "@/lib/review/sample";
import type { SourceType } from "@/lib/review/types";
import { isStorageConfigured, uploadDiff } from "@/lib/storage";
import { createReview } from "@/lib/store";

const MAX_DIFF = 400_000;

export async function startReview(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  try {
    const user = await requireUser();
    const mode = String(formData.get("source") ?? "paste") as SourceType | "sample";
    let sourceType: SourceType = mode === "sample" ? "paste" : mode;
    let title = "Untitled patch";
    let sourceUrl: string | null = null;
    let repo: string | null = null;
    let prNumber: number | null = null;
    let diff = "";

    if (mode === "sample") {
      title = SAMPLE_TITLE;
      repo = "acme/checkout";
      prNumber = 1842;
      diff = SAMPLE_DIFF;
    } else if (mode === "github_pr") {
      const url = String(formData.get("url") ?? "");
      const pr = await fetchGithubPullRequest(url);
      title = pr.title;
      sourceUrl = pr.sourceUrl;
      repo = pr.repo;
      prNumber = pr.prNumber;
      diff = pr.diff;
    } else if (mode === "upload") {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return { error: "Drop a .diff or .patch file." };
      }
      title = file.name;
      diff = await file.text();
    } else {
      diff = String(formData.get("diff") ?? "");
      title = String(formData.get("title") ?? "").trim() || "Pasted patch";
    }

    if (!diff.trim()) {
      return { error: "The patch is empty." };
    }
    if (diff.length > MAX_DIFF) {
      return { error: "That patch is larger than 400KB. Split it or upload a smaller range." };
    }

    const id = crypto.randomUUID();
    const key = isStorageConfigured() ? `${user.id}/${id}.diff` : null;
    if (key) {
      await uploadDiff(key, diff);
    }

    await createReview({
      id,
      userId: user.id,
      title,
      sourceType,
      sourceUrl,
      repo,
      prNumber,
      diffKey: key,
      diffText: diff,
    });

    redirect(`/reviews/${id}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return {
      error: error instanceof Error ? error.message : "Could not start the review.",
    };
  }
}

function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}
