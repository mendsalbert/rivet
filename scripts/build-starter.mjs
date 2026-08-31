#!/usr/bin/env node
/**
 * Regenerate starter/ from the complete app at repo root.
 * Run from the repository root: node scripts/build-starter.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const starter = join(root, "starter");

const EXCLUDE = new Set([
  "node_modules",
  ".next",
  ".git",
  "starter",
  ".env.local",
  ".neon",
  "tsconfig.tsbuildinfo",
  "package-lock.json",
]);

const STUB_FILES = [
  "lib/review/agent.ts",
  "lib/storage.ts",
  "functions/review.ts",
  "lib/github-app.ts",
  "lib/github-webhook.ts",
];

function copyDir(src, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => {
      const rel = path.slice(root.length + 1);
      const top = rel.split("/")[0];
      if (EXCLUDE.has(top) || EXCLUDE.has(rel)) return false;
      if (rel.endsWith(".pem") || rel === ".github-app.local.json") return false;
      return true;
    },
  });
}

console.log("Copying complete app → starter/ …");
copyDir(root, starter);

// Restore tutorial stubs (this script does not auto-generate stub bodies — they live in git).
for (const file of STUB_FILES) {
  const stubPath = join(starter, file);
  if (!existsSync(stubPath)) {
    console.warn(`  missing stub: ${file} — re-apply manually`);
  }
}

console.log("Done. Review starter/ stub files and STARTER.md before committing.");
