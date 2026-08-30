import { Hono } from "hono";
import { cors } from "hono/cors";
import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { runReviewAgent } from "../lib/review/agent";
import { encodeSse } from "../lib/review/sse";
import type { Finding } from "../lib/review/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const jwks = process.env.NEON_AUTH_JWKS_URL
  ? createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL))
  : null;
const issuer = process.env.NEON_AUTH_BASE_URL
  ? new URL(process.env.NEON_AUTH_BASE_URL).origin
  : undefined;

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: (origin) => origin || "*",
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.post("/review", async (c) => {
  const userId = await callerId(c.req.header("authorization"));
  if (!userId) return c.text("Unauthorized", 401);

  const { reviewId } = (await c.req.json()) as { reviewId?: string };
  if (!reviewId) return c.text("Missing reviewId", 400);

  const { rows } = await pool.query(
    "select id, user_id, diff_text, diff_key, status from reviews where id = $1",
    [reviewId],
  );
  const review = rows[0] as
    | {
        id: string;
        user_id: string;
        diff_text: string | null;
        diff_key: string | null;
        status: string;
      }
    | undefined;

  if (!review || review.user_id !== userId) return c.text("Not found", 404);

  const diff = review.diff_text ?? (await loadFromStorage(review.diff_key));
  if (!diff) return c.text("Diff missing", 409);

  await pool.query("update reviews set status = 'running' where id = $1", [reviewId]);

  const encoder = new TextEncoder();
  let order = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runReviewAgent(diff)) {
          if (event.type === "finding") {
            order += 1;
            await persistFinding(reviewId, event.finding, order);
          }
          if (event.type === "complete") {
            await pool.query(
              "update reviews set status = 'complete', summary = $2, verdict = $3, completed_at = now() where id = $1",
              [reviewId, event.summary, event.verdict],
            );
          }
          controller.enqueue(encoder.encode(encodeSse(event)));
        }
      } catch (error) {
        await pool.query(
          "update reviews set status = 'failed', summary = $2, completed_at = now() where id = $1",
          [reviewId, error instanceof Error ? error.message : "Review failed"],
        );
        controller.enqueue(
          encoder.encode(
            encodeSse({
              type: "error",
              message: error instanceof Error ? error.message : "Review failed",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});

async function persistFinding(reviewId: string, finding: Finding, sortOrder: number) {
  await pool.query(
    `insert into findings (id, review_id, severity, file, line, title, body, suggestion, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (id) do nothing`,
    [
      finding.id,
      reviewId,
      finding.severity,
      finding.file,
      finding.line,
      finding.title,
      finding.body,
      finding.suggestion ?? null,
      sortOrder,
    ],
  );
}

async function loadFromStorage(key: string | null) {
  if (!key) return null;
  const { Files } = await import("files-sdk");
  const { neon } = await import("files-sdk/neon");
  const files = new Files({ adapter: neon({ bucket: "diffs" }) });
  const stored = await files.download(key);
  return stored.text();
}

async function callerId(header: string | undefined) {
  if (!jwks || !issuer) return null;
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, { issuer });
    return String(payload.sub ?? "");
  } catch {
    return null;
  }
}

export default app;
