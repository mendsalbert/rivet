import type { DiffFile } from "@/lib/review/parse-diff";

export function DiffView({
  files,
  active,
}: {
  files: DiffFile[];
  active?: { file: string; line: number | null };
}) {
  if (files.length === 0) {
    return <p className="text-[var(--muted)]">No parseable unified diff.</p>;
  }

  return (
    <div className="diff-pane">
      {files.map((file) => (
        <section key={file.path} className="diff-file">
          <h3>
            {file.path}
            <span className="ml-3 font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
              +{file.additions} / −{file.deletions}
            </span>
          </h3>
          <div>
            {file.lines.map((line, index) => {
              const hit =
                active?.file === file.path &&
                active.line !== null &&
                line.newLine === active.line;
              return (
                <div
                  key={`${file.path}-${index}`}
                  id={line.newLine ? `L-${file.path}-${line.newLine}` : undefined}
                  className={`diff-line ${line.type}${hit ? " hit" : ""}`}
                >
                  <span className="text-[var(--muted)]">{line.newLine ?? ""}</span>
                  <span>
                    {line.type === "add" ? "+ " : line.type === "del" ? "− " : "  "}
                    {line.text}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
