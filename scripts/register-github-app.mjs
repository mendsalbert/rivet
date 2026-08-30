/**
 * One-shot GitHub App registration via the manifest flow.
 *
 *   node scripts/register-github-app.mjs
 *
 * Opens a local page → you confirm on GitHub → credentials land in
 * .env.local and .github-app.local.json (both gitignored).
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = 3847;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env.local");
const META_PATH = join(ROOT, ".github-app.local.json");
const PEM_PATH = join(ROOT, "rivet-github-app.pem");

const manifest = {
  name: "Rivet Review",
  url: "https://github.com/mendsalbert/rivet",
  redirect_url: `http://127.0.0.1:${PORT}/callback`,
  callback_urls: ["http://localhost:3000/api/github/setup"],
  setup_url: "http://localhost:3000/reviews",
  description:
    "AI code review agent. Walks the pull request diff, cites lines, and posts the review.",
  public: false,
  default_permissions: {
    contents: "read",
    metadata: "read",
    pull_requests: "write",
  },
  default_events: ["pull_request"],
  hook_attributes: {
    // Active so PR events deliver immediately after registration.
    // For local dev, point this at a smee.io URL via `npm run github:webhook`.
    url: "https://example.com/rivet-webhook",
    active: true,
  },
};

function homePage() {
  const manifestJson = JSON.stringify(manifest).replace(/'/g, "&#39;");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Register Rivet GitHub App</title>
  <style>
    body { font-family: ui-sans-serif, system-ui; max-width: 40rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5; color: #111; }
    button { font: inherit; padding: 0.75rem 1.2rem; border-radius: 8px; border: 0; background: #0b0d10; color: #c6f43a; cursor: pointer; }
    code { background: #f3f4f6; padding: 0.1rem 0.35rem; border-radius: 4px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.25rem; margin-top: 1.5rem; }
    .note { color: #4b5563; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>Register Rivet Review</h1>
  <p>This creates a GitHub App with permission to read contents and write pull request reviews.</p>
  <p class="note">Use a browser where you are already signed into GitHub as <code>mendsalbert</code>.</p>
  <div class="card">
    <p><strong>Permissions</strong></p>
    <ul>
      <li>Contents: read</li>
      <li>Pull requests: write</li>
      <li>Metadata: read</li>
    </ul>
    <p>Webhook starts <em>inactive</em> so we can explore the App API before public tunnels.</p>
    <form action="https://github.com/settings/apps/new" method="post">
      <input type="hidden" name="manifest" value='${manifestJson}' />
      <button type="submit">Create GitHub App on GitHub</button>
    </form>
  </div>
</body>
</html>`;
}

function donePage(app) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Rivet App created</title>
  <style>
    body { font-family: ui-sans-serif, system-ui; max-width: 40rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5; }
    a { color: #0f766e; }
    code { background: #f3f4f6; padding: 0.1rem 0.35rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Rivet Review is registered</h1>
  <p>App ID <code>${app.id}</code> · slug <code>${app.slug}</code></p>
  <p>Credentials were written to <code>.env.local</code> and <code>rivet-github-app.pem</code>.</p>
  <p><a href="${app.html_url}" target="_blank" rel="noreferrer">Open app settings</a></p>
  <p><a href="https://github.com/apps/${app.slug}/installations/new" target="_blank" rel="noreferrer">Install on a repository</a></p>
  <p>You can close this tab and return to the terminal.</p>
</body>
</html>`;
}

function upsertEnv(key, value) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, line);
  else text = `${text.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, text);
}

async function exchangeCode(code) {
  const response = await fetch(
    `https://api.github.com/app-manifests/${code}/conversions`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "rivet-review-agent",
      },
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Manifest conversion failed (${response.status}): ${body}`);
  }
  return response.json();
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(homePage());
    return;
  }

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing code query param.");
      return;
    }

    try {
      const app = await exchangeCode(code);
      writeFileSync(PEM_PATH, app.pem);
      writeFileSync(
        META_PATH,
        JSON.stringify(
          {
            id: app.id,
            slug: app.slug,
            client_id: app.client_id,
            html_url: app.html_url,
            owner: app.owner?.login,
            created_at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      upsertEnv("GITHUB_APP_ID", String(app.id));
      upsertEnv("GITHUB_APP_CLIENT_ID", app.client_id);
      upsertEnv("GITHUB_APP_CLIENT_SECRET", app.client_secret);
      upsertEnv("GITHUB_APP_WEBHOOK_SECRET", app.webhook_secret ?? "");
      upsertEnv("GITHUB_APP_PRIVATE_KEY_PATH", "rivet-github-app.pem");
      upsertEnv("GITHUB_APP_SLUG", app.slug);

      console.log("\nGitHub App created.");
      console.log(`  id:    ${app.id}`);
      console.log(`  slug:  ${app.slug}`);
      console.log(`  pem:   ${PEM_PATH}`);
      console.log(`  meta:  ${META_PATH}`);
      console.log(
        `\nInstall: https://github.com/apps/${app.slug}/installations/new\n`,
      );

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(donePage(app));

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 500);
    } catch (error) {
      console.error(error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(error instanceof Error ? error.message : "Conversion failed");
    }
    return;
  }

  res.writeHead(404).end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`Open ${url} and click “Create GitHub App on GitHub”.`);
  openBrowser(url);
});
