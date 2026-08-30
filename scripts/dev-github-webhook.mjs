/**
 * Point the Rivet GitHub App webhook at a smee.io channel and forward
 * events to the local Next.js server.
 *
 *   npm run github:webhook
 *
 * Requires GITHUB_APP_* credentials in .env.local (from register-github-app.mjs).
 * Keep `npm run dev` running in another terminal.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SignJWT } from "jose";
import nextEnv from "@next/env";
import SmeeClient from "smee-client";

const { loadEnvConfig } = nextEnv;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(ROOT);

const TARGET = process.env.GITHUB_WEBHOOK_TARGET || "http://127.0.0.1:3000/api/github/webhook";
const META_PATH = join(ROOT, ".github-app.local.json");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

function privateKeyPem() {
  if (process.env.GITHUB_APP_PRIVATE_KEY) {
    return process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  const relative = process.env.GITHUB_APP_PRIVATE_KEY_PATH || "rivet-github-app.pem";
  const path = join(ROOT, relative);
  if (!existsSync(path)) throw new Error(`Private key not found at ${path}`);
  return readFileSync(path, "utf8");
}

async function appJwt() {
  const appId = requireEnv("GITHUB_APP_ID");
  const key = createPrivateKey(privateKeyPem());
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(appId)
    .sign(key);
}

async function patchWebhook(url, secret) {
  const jwt = await appJwt();
  const response = await fetch("https://api.github.com/app/hook/config", {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "User-Agent": "rivet-review-agent",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      content_type: "json",
      secret,
      insecure_ssl: "0",
    }),
  });
  if (!response.ok) {
    throw new Error(`Webhook update failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function ensureSmeeChannel() {
  if (process.env.GITHUB_WEBHOOK_PROXY_URL) return process.env.GITHUB_WEBHOOK_PROXY_URL;
  const response = await fetch("https://smee.io/new", { method: "HEAD", redirect: "manual" });
  const location = response.headers.get("location");
  if (!location) throw new Error("Could not create a smee.io channel.");
  return location;
}

function upsertEnv(key, value) {
  const envPath = join(ROOT, ".env.local");
  let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, line);
  else text = `${text.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, text);
}

function upsertMeta(patch) {
  const current = existsSync(META_PATH)
    ? JSON.parse(readFileSync(META_PATH, "utf8"))
    : {};
  writeFileSync(META_PATH, JSON.stringify({ ...current, ...patch }, null, 2));
}

async function main() {
  const secret = requireEnv("GITHUB_APP_WEBHOOK_SECRET");
  const slug = process.env.GITHUB_APP_SLUG || "rivet-review";
  const channel = await ensureSmeeChannel();

  console.log(`Smee channel: ${channel}`);
  console.log(`Forwarding to: ${TARGET}`);

  await patchWebhook(channel, secret);
  upsertEnv("GITHUB_WEBHOOK_PROXY_URL", channel);
  upsertMeta({
    webhook_proxy_url: channel,
    webhook_target: TARGET,
    webhook_updated_at: new Date().toISOString(),
  });

  console.log("GitHub App webhook URL updated and active via smee.\n");
  console.log(`Install: https://github.com/apps/${slug}/installations/new`);
  console.log("Open or push a PR on an installed repo — Rivet will review it.\n");

  const smee = new SmeeClient({
    source: channel,
    target: TARGET,
    logger: console,
  });
  smee.start();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
