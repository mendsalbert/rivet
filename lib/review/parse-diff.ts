export type DiffLine = {
  type: "hunk" | "add" | "del" | "ctx" | "meta";
  text: string;
  newLine: number | null;
  oldLine: number | null;
};

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
};

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let newLine = 0;
  let oldLine = 0;

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith("diff --git ")) {
      const match = raw.match(/^diff --git a\/\S+ b\/(.+)$/);
      current = {
        path: match?.[1] ?? raw.replace(/^diff --git /, ""),
        additions: 0,
        deletions: 0,
        lines: [{ type: "meta", text: raw, newLine: null, oldLine: null }],
      };
      files.push(current);
      continue;
    }

    if (!current) continue;

    if (raw.startsWith("+++ ") || raw.startsWith("--- ") || raw.startsWith("index ")) {
      current.lines.push({ type: "meta", text: raw, newLine: null, oldLine: null });
      continue;
    }

    if (raw.startsWith("@@")) {
      const hunk = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLine = hunk ? Number(hunk[1]) : oldLine;
      newLine = hunk ? Number(hunk[2]) : newLine;
      current.lines.push({ type: "hunk", text: raw, newLine, oldLine });
      continue;
    }

    if (raw.startsWith("+")) {
      current.additions += 1;
      current.lines.push({ type: "add", text: raw.slice(1), newLine, oldLine: null });
      newLine += 1;
      continue;
    }

    if (raw.startsWith("-")) {
      current.deletions += 1;
      current.lines.push({ type: "del", text: raw.slice(1), newLine: null, oldLine });
      oldLine += 1;
      continue;
    }

    if (raw.startsWith("\\") || raw.startsWith("new file") || raw.startsWith("deleted file")) {
      current.lines.push({ type: "meta", text: raw, newLine: null, oldLine: null });
      continue;
    }

    current.lines.push({ type: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : raw, newLine, oldLine });
    newLine += 1;
    oldLine += 1;
  }

  return files;
}

export function addedLines(files: DiffFile[]) {
  return files.flatMap((file) =>
    file.lines
      .filter((line) => line.type === "add")
      .map((line) => ({ file: file.path, line: line.newLine, text: line.text })),
  );
}
