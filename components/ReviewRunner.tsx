"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { parseUnifiedDiff } from "@/lib/review/parse-diff";
import { readSse } from "@/lib/review/sse";
import type { Finding, Review, ReviewEvent } from "@/lib/review/types";
import { DiffView } from "./DiffView";
import { FindingList } from "./FindingList";

const FN_URL = process.env.NEXT_PUBLIC_REVIEW_FN_URL;

export function ReviewRunner({ review }: { review: Review }) {
  const [current, setReview] = useState(review);
  const [phase, setPhase] = useState(
    review.status === "complete" ? "complete" : "idle",
  );
  const [active, setActive] = useState<{ file: string; line: number | null }>();
  const started = useRef(false);

  useEffect(() => {
    if (review.status !== "queued" || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.id]);

  async function run() {
    setPhase("reading");
    try {
      const response = await openStream(review.id);
      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }
      await readSse(response.body, (event) => applyEvent(event));
    } catch (error) {
      setPhase("failed");
      setReview((prev) => ({
        ...prev,
        status: "failed",
        summary: error instanceof Error ? error.message : "Review failed",
      }));
    }
  }

  function applyEvent(event: ReviewEvent) {
    if (event.type === "status") {
      setPhase(event.phase);
      return;
    }
    if (event.type === "finding") {
      setReview((prev) => ({
        ...prev,
        findings: [...prev.findings, event.finding],
      }));
      setActive({ file: event.finding.file, line: event.finding.line });
      return;
    }
    if (event.type === "complete") {
      setPhase("complete");
      setReview((prev) => ({
        ...prev,
        status: "complete",
        summary: event.summary,
        verdict: event.verdict,
      }));
      return;
    }
    if (event.type === "error") {
      setPhase("failed");
      setReview((prev) => ({ ...prev, status: "failed", summary: event.message }));
    }
  }

  const files = parseUnifiedDiff(current.diffText ?? "");
  const tone =
    current.verdict === "request_changes" || phase === "failed"
      ? "bad"
      : current.verdict === "approve"
        ? "good"
        : phase === "reading" || phase === "walking" || phase === "citing"
          ? "live"
          : undefined;

  return (
    <div className="page-shell">
      <header className="mb-10 max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <span className="status-pill" data-tone={tone}>
            {(tone === "live" || phase === "reading" || phase === "walking" || phase === "citing") && (
              <span className="dot" />
            )}
            {labelFor(current.verdict, phase)}
          </span>
          {current.findings.length > 0 ? (
            <span className="status-pill">{current.findings.length} findings</span>
          ) : null}
        </div>
        <h1 className="page-title mt-4">{current.title}</h1>
        <p className="page-lede">
          {current.repo ? `${current.repo}${current.prNumber ? `#${current.prNumber}` : ""}` : "pasted patch"}
          {current.summary ? ` — ${current.summary}` : ""}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="pane">
          <div className="pane-head">
            <span>Patch</span>
            <span>{files.length} file{files.length === 1 ? "" : "s"}</span>
          </div>
          <div className="pane-body">
            <DiffView files={files} active={active} />
          </div>
        </div>

        <aside className="pane h-fit lg:sticky lg:top-24">
          <div className="pane-head">
            <span>{phase === "complete" ? "Findings" : phase}</span>
            <span>cited lines</span>
          </div>
          <div className="pane-body">
            {current.status !== "complete" &&
            phase !== "reading" &&
            phase !== "walking" &&
            phase !== "citing" ? (
              <button className="btn mb-6" type="button" onClick={() => void run()}>
                {current.status === "failed" ? "Retry" : "Run Rivet"}
              </button>
            ) : null}
            <FindingList
              findings={current.findings}
              onSelect={(finding: Finding) => {
                setActive({ file: finding.file, line: finding.line });
                if (finding.line) {
                  document
                    .getElementById(`L-${finding.file}-${finding.line}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function labelFor(verdict: Review["verdict"], phase: string) {
  if (verdict === "request_changes") return "Request changes";
  if (verdict === "comment") return "Comment";
  if (verdict === "approve") return "Approve";
  if (phase === "failed") return "Failed";
  return "Walking the patch";
}

async function openStream(reviewId: string) {
  if (FN_URL) {
    const { data } = await authClient.token();
    const token = data?.token;
    return fetch(`${FN_URL.replace(/\/$/, "")}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reviewId }),
    });
  }

  return fetch(`/api/reviews/${reviewId}/run`, { method: "POST" });
}
