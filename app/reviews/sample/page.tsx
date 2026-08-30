import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ensureSampleReview } from "@/lib/review/sample-review";

export const dynamic = "force-dynamic";

export default async function SampleReviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const review = await ensureSampleReview(user.id);
  redirect(`/reviews/${review.id}`);
}
