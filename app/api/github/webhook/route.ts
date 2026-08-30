import { after } from "next/server";
import {
  processPullRequestWebhook,
  shouldHandlePullRequest,
  verifyGithubSignature,
} from "@/lib/github-webhook";
import { isGithubAppConfigured } from "@/lib/github-app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isGithubAppConfigured()) {
    return new Response("GitHub App is not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGithubSignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") {
    return Response.json({ ok: true, message: "pong" });
  }

  if (event !== "pull_request") {
    return Response.json({ ok: true, ignored: event });
  }

  let payload: Parameters<typeof shouldHandlePullRequest>[0];
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!shouldHandlePullRequest(payload)) {
    return Response.json({ ok: true, skipped: payload.action });
  }

  after(async () => {
    try {
      const result = await processPullRequestWebhook(payload);
      console.info("[github-webhook] review posted", result);
    } catch (error) {
      console.error("[github-webhook] review failed", error);
    }
  });

  return Response.json({ ok: true, queued: true }, { status: 202 });
}
