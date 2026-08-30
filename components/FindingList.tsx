import type { Finding } from "@/lib/review/types";

export function FindingList({
  findings,
  onSelect,
}: {
  findings: Finding[];
  onSelect?: (finding: Finding) => void;
}) {
  if (findings.length === 0) {
    return <p className="text-[var(--muted)]">Waiting for the first citation.</p>;
  }

  return (
    <div>
      {findings.map((finding) => (
        <article key={finding.id} className="finding" data-sev={finding.severity}>
          <p className={`sev ${finding.severity}`}>{finding.severity}</p>
          <button
            type="button"
            className="mt-1 cursor-pointer text-left"
            onClick={() => onSelect?.(finding)}
          >
            <h3 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.03em] transition-colors hover:text-[var(--teal)]">
              {finding.title}
            </h3>
          </button>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
            {finding.file}
            {finding.line ? `:${finding.line}` : ""}
          </p>
          <p className="mt-3 text-[0.95rem] leading-relaxed">{finding.body}</p>
          {finding.suggestion ? (
            <p className="mt-3 rounded-lg border border-[var(--line)] bg-[rgba(198,244,58,0.08)] px-3 py-2 text-sm text-[var(--ink-soft)]">
              {finding.suggestion}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
