import { requireUser } from "@/lib/auth/session";
import { runReviewAgent } from "@/lib/review/agent";
import { sseResponse } from "@/lib/review/sse";
import { completeReview, failReview, getReview, markRunning, saveFinding } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const review = await getReview(id, user.id);
  if (!review) return new Response("Not found", { status: 404 });
  if (!review.diffText) return new Response("Diff missing", { status: 409 });

  await markRunning(id);
  let order = 0;

  const stream = sseResponse(
    (async function* () {
      try {
        for await (const event of runReviewAgent(review.diffText!)) {
          if (event.type === "finding") {
            order += 1;
            await saveFinding(id, event.finding, order);
          }
          if (event.type === "complete") {
            await completeReview(id, event.summary, event.verdict);
          }
          yield event;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Review failed";
        await failReview(id, message);
        yield { type: "error" as const, message };
      }
    })(),
    380,
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
