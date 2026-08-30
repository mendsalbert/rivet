export type Severity = "critical" | "warning" | "nit";
export type Verdict = "approve" | "comment" | "request_changes";
export type ReviewStatus = "queued" | "running" | "complete" | "failed";
export type SourceType = "github_pr" | "paste" | "upload";

export type Finding = {
  id: string;
  severity: Severity;
  file: string;
  line: number | null;
  title: string;
  body: string;
  suggestion?: string;
};

export type Review = {
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
  findings: Finding[];
};

export type ReviewEvent =
  | { type: "status"; phase: string; detail?: string }
  | { type: "finding"; finding: Finding }
  | { type: "complete"; summary: string; verdict: Verdict }
  | { type: "error"; message: string };
