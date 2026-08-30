import Link from "next/link";
import { redirect } from "next/navigation";
import { githubAppSlug } from "@/lib/github-app";

export const dynamic = "force-dynamic";

/**
 * GitHub App setup / installation callback.
 * After install, send the user to the reviews ledger.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const setupAction = url.searchParams.get("setup_action");
  const installationId = url.searchParams.get("installation_id");

  if (setupAction === "install" && installationId) {
    redirect(`/reviews?installed=${installationId}`);
  }

  if (setupAction === "request") {
    redirect("/reviews?install=requested");
  }

  redirect(`https://github.com/apps/${githubAppSlug()}/installations/new`);
}
