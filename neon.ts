import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  preview: {
    aiGateway: true,
    buckets: {
      diffs: { access: "private" },
    },
    functions: {
      review: {
        name: "Rivet review agent",
        source: "./functions/review.ts",
      },
    },
  },
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
