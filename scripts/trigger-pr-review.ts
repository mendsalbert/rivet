import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { processPullRequestWebhook } from "../lib/github-webhook";

async function main() {
  const number = Number(process.argv[2] || "3");
  const payload = {
    action: "opened",
    installation: { id: 157735812 },
    repository: {
      name: "rivet",
      owner: { login: "mendsalbert" },
      full_name: "mendsalbert/rivet",
    },
    pull_request: {
      number,
      title: `PR #${number}`,
      html_url: `https://github.com/mendsalbert/rivet/pull/${number}`,
      draft: false,
      head: { sha: "placeholder" },
    },
  };

  const result = await processPullRequestWebhook(payload);
  console.log("done", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
