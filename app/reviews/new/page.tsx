import { Composer } from "@/components/Composer";
import { isAuthConfigured } from "@/lib/auth/config";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isAiConfigured } from "@/lib/review/agent";
import { isStorageConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default function NewReviewPage() {
  return (
    <main className="page-shell">
      <p className="page-kicker">New review</p>
      <h1 className="page-title max-w-[14ch]">Hand Rivet a patch.</h1>
      <p className="page-lede mb-12">
        A GitHub pull request, a pasted unified diff, or a file. The agent reads added lines, not the description.
      </p>
      <Composer />
      <p className="mt-12 max-w-xl font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--muted)]">
        {isAuthConfigured() ? "Neon Auth is on." : "Auth is local demo."}{" "}
        {isStorageConfigured()
          ? "Patches also land in Object Storage."
          : "Storage is unset — the patch stays in the review record."}{" "}
        {process.env.NEXT_PUBLIC_REVIEW_FN_URL
          ? "The agent will stream from the Neon Function."
          : isAiConfigured()
            ? "The agent will run in Next.js via the AI Gateway."
            : "The local inspector will walk the patch until you deploy the Function."}
        {isDatabaseConfigured() ? " Postgres is linked." : " Reviews persist until the server restarts."}
      </p>
    </main>
  );
}
