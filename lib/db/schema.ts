import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  repo: text("repo"),
  prNumber: integer("pr_number"),
  status: text("status").notNull().default("queued"),
  summary: text("summary"),
  verdict: text("verdict"),
  diffKey: text("diff_key"),
  diffText: text("diff_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  reviewId: text("review_id")
    .notNull()
    .references(() => reviews.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  file: text("file").notNull(),
  line: integer("line"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  suggestion: text("suggestion"),
  sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
});
