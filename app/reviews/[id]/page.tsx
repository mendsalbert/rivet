import { notFound } from "next/navigation";
import { ReviewRunner } from "@/components/ReviewRunner";
import { getSessionUser } from "@/lib/auth/session";
import { getReview } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) notFound();
  const { id } = await params;
  const review = await getReview(id, user.id);
  if (!review) notFound();

  return (
    <main>
      <ReviewRunner review={review} />
    </main>
  );
}
