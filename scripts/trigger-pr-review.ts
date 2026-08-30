import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { processPullRequestWebhook } from "../lib/github-webhook";

async function main() {
  const payload = {
    action: "opened",
    installation: { id: 157735812 },
    repository: {
      name: "rivet",
      owner: { login: "mendsalbert" },
      full_name: "mendsalbert/rivet",
    },
    pull_request: {
      number: 2,
      title: "test: trigger Rivet review",
      html_url: "https://github.com/mendsalbert/rivet/pull/2",
      draft: false,
      head: { sha: "d6d0eca" },
    },
  };

  const result = await processPullRequestWebhook(payload);
  console.log("done", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
