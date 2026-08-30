import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listReviews } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const reviews = await listReviews(user.id);

  return (
    <main className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="page-kicker">Reviews</p>
          <h1 className="page-title">The ledger.</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/install" className="btn btn-ghost">
            Install on GitHub
          </Link>
          <Link href="/reviews/new" className="btn">
            New review
          </Link>
        </div>
      </div>

      <ul className="ledger-list">
        {reviews.length === 0 ? (
          <li className="pane">
            <div className="pane-body text-[var(--muted)]">
              No patches yet.{" "}
              <Link href="/reviews/new" className="underline underline-offset-4">
                Hand Rivet one
              </Link>
              .
            </div>
          </li>
        ) : (
          reviews.map((review) => (
            <li key={review.id}>
              <Link href={`/reviews/${review.id}`} className="ledger-item">
                <strong>{label(review.verdict, review.status)}</strong>
                <div>
                  <p className="font-medium tracking-[-0.02em]">{review.title}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {review.repo ?? "patch"} · {new Date(review.createdAt).toLocaleString()}
                  </p>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}

function label(verdict: string | null, status: string) {
  if (verdict === "request_changes") return "Block";
  if (verdict === "comment") return "Comment";
  if (verdict === "approve") return "Approve";
  return status;
}
