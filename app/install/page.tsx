import Link from "next/link";
import { githubAppSlug, isGithubAppConfigured } from "@/lib/github-app";

export const dynamic = "force-dynamic";

export default function GithubInstallPage() {
  const configured = isGithubAppConfigured();
  const slug = githubAppSlug();
  const installUrl = `https://github.com/apps/${slug}/installations/new`;

  return (
    <main className="page-shell">
      <p className="page-kicker">GitHub App</p>
      <h1 className="page-title">Install Rivet on a repo.</h1>
      <p className="mt-4 max-w-xl text-[var(--muted)]">
        Once installed, Rivet reviews pull requests automatically: opened, updated, and
        marked ready for review. Findings are posted as a PR review on GitHub.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {configured ? (
          <a href={installUrl} className="btn">
            Install {slug}
          </a>
        ) : (
          <span className="btn opacity-50">App credentials missing</span>
        )}
        <Link href="/reviews" className="btn btn-ghost">
          Back to reviews
        </Link>
      </div>

      <ol className="mt-10 max-w-xl list-decimal space-y-3 pl-5 text-sm text-[var(--muted)]">
        <li>Install the app on the repositories you want reviewed.</li>
        <li>
          For local dev, run <code className="text-[var(--fg)]">npm run github:webhook</code> so
          GitHub can reach your machine.
        </li>
        <li>Open or push to a pull request — Rivet posts the review.</li>
      </ol>
    </main>
  );
}
