"use client";

import { useActionState, useState } from "react";
import { startReview } from "@/app/reviews/new/actions";

const modes = [
  { id: "github_pr", label: "GitHub PR" },
  { id: "paste", label: "Paste" },
  { id: "upload", label: "Upload" },
] as const;

export function Composer() {
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("github_pr");
  const [state, formAction, pending] = useActionState(startReview, null);

  return (
    <div className="max-w-2xl">
      <div className="pane">
        <div className="pane-head">
          <span>Composer</span>
          <span>unified diff in · review out</span>
        </div>
        <div className="pane-body">
          <form action={formAction}>
            <input type="hidden" name="source" value={mode} />
            <div className="mode">
              {modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-active={mode === item.id}
                  onClick={() => setMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {mode === "github_pr" ? (
              <label className="block">
                <span className="mb-2 block text-sm text-[var(--muted)]">Pull request URL</span>
                <input
                  className="field"
                  name="url"
                  placeholder="https://github.com/org/repo/pull/1842"
                  required
                />
              </label>
            ) : null}

            {mode === "paste" ? (
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-[var(--muted)]">Title</span>
                  <input className="field" name="title" placeholder="checkout: skip webhook verification" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-[var(--muted)]">Unified diff</span>
                  <textarea
                    className="field min-h-64 font-[family-name:var(--font-mono)] text-[13px]"
                    name="diff"
                    placeholder="diff --git a/app/api/checkout/route.ts..."
                    required
                  />
                </label>
              </div>
            ) : null}

            {mode === "upload" ? (
              <label className="block">
                <span className="mb-2 block text-sm text-[var(--muted)]">.diff or .patch</span>
                <input className="field" name="file" type="file" accept=".diff,.patch,.txt" required />
              </label>
            ) : null}

            {state?.error ? <p className="mt-4 text-[var(--del)]">{state.error}</p> : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Reading the patch…" : "Run Rivet"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <form action={formAction} className="mt-4">
        <input type="hidden" name="source" value="sample" />
        <button className="btn btn-ghost" type="submit" disabled={pending}>
          Load the checkout patch
        </button>
      </form>
    </div>
  );
}
