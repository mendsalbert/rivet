# Rivet

An AI code review agent. The agent is the product — it reads the unified diff, cites the line, and writes the review. Neon is the backend: Auth, Object Storage, Functions, AI Gateway, and Postgres, declared in one `neon.ts`.

Rivet does not summarize the PR description. It walks the patch and stops on the lines that can ship a bug.

## What it does

- **Paste a PR or diff** — public GitHub pull request URL, unified diff, or file upload
- **Stream the review live** — watch the agent read the patch, report findings, and finish with a verdict
- **Review on GitHub** — install the GitHub App and Rivet posts findings as a PR review on open, sync, and ready-for-review events
- **Fallback without an LLM** — a local heuristic inspector walks the patch when no model key is configured

## Quick start (local demo)

No Neon project or API keys required. Reviews live in memory until the server restarts.

**Tutorial learners:** use the [`starter/`](starter/) directory — same UI, with `TUTORIAL:` stubs to fill in episode by episode. See [`starter/STARTER.md`](starter/STARTER.md).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Action | Where |
| --- | --- |
| See a finished review | **See a review** → sample checkout patch |
| Run the agent live | **Open the agent** → paste a diff or PR URL |
| Load the demo patch | **Open the agent** → **Load the checkout patch** |

The local inspector runs without an LLM. Add a Gemini key (see [AI providers](#ai-providers)) to use a model in Next.js.

## AI providers

Rivet picks a model in this order:

1. **Gemini** (recommended for local dev) — set `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`. Get a key at [Google AI Studio](https://aistudio.google.com/apikey).
2. **Neon AI Gateway** — used when Gemini is not set and `NEON_AI_GATEWAY_TOKEN` is present (injected after `neon deploy`).
3. **Heuristic fallback** — pattern-based inspector in `lib/review/heuristic.ts`; no API key needed.

Optional overrides:

```bash
GEMINI_MODEL=gemini-2.5-pro   # default: gemini-2.5-flash
GITHUB_TOKEN=ghp_...          # raises rate limits when fetching public PR diffs
```

## Wire the Neon backend

Create the project in **AWS US East (Ohio)** (`aws-us-east-2`). Object Storage, Functions, and the AI Gateway are on that region during beta.

```bash
npm i -g neon@latest
neon auth
neon link --project-name rivet --region-id aws-us-east-2
neon checkout main
neon config init   # keep this repo's neon.ts if it already exists
```

Add a cookie secret (Auth does not inject one):

```bash
echo "NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)" >> .env.local
```

Deploy services and pull credentials:

```bash
neon deploy
npm run db:push
neon functions get review
```

Copy the function `invocation_url` into `.env.local`:

```bash
NEXT_PUBLIC_REVIEW_FN_URL=https://<branch_id>-review.compute.<cell>.us-east-2.aws.neon.tech/
```

Restart `npm run dev`. Sign-up starts working. Uploaded patches land in the `diffs` bucket. The browser streams the agent from the Function so a long tool loop is not cut off by a short host timeout.

Local function iteration:

```bash
neon dev
```

### What maps to which Neon piece

| What Rivet does | Neon |
| --- | --- |
| Who owns the review | Managed Better Auth (`auth: true`) |
| The patch file | Object Storage bucket `diffs` |
| Walking the diff / model calls | Function `review` + AI Gateway |
| Verdict and findings | Postgres via Drizzle |

The whole backend is `neon.ts`. `neon deploy` provisions it.

## GitHub App (automatic PR reviews)

Rivet can post reviews directly on pull requests when the GitHub App is installed on a repo.

### 1. Register the app

```bash
npm run github:register
```

This opens a local page. Confirm on GitHub. Credentials are written to `.env.local` and `rivet-github-app.pem` (both gitignored).

The app needs **Contents: read**, **Pull requests: write**, and **Metadata: read**. It listens for `pull_request` events (`opened`, `synchronize`, `reopened`, `ready_for_review`).

### 2. Forward webhooks locally

In a second terminal (with `npm run dev` already running):

```bash
npm run github:webhook
```

This creates a [smee.io](https://smee.io) channel, points the app webhook at it, and forwards events to `http://127.0.0.1:3000/api/github/webhook`.

### 3. Install on a repository

Open [http://localhost:3000/install](http://localhost:3000/install) and install the app on the repos you want reviewed. Open or push to a PR — Rivet fetches the diff, runs the agent, and posts the review on GitHub.

For production, set the app webhook URL to your deployed `/api/github/webhook` endpoint instead of smee.io.

## How a review runs

```
Input (PR URL / diff / webhook)
        │
        ▼
  Parse unified diff
        │
        ▼
  Agent (Gemini / Neon Gateway / heuristic)
        │
        ├── reportFinding (file, line, severity, suggestion)
        └── finishReview (verdict + summary)
        │
        ▼
  Stream SSE to browser  ·  Post GitHub PR review  ·  Persist to Postgres
```

The agent uses two tools: `reportFinding` for each issue and `finishReview` once when done. Severities are `critical`, `warning`, or `nit`.

## Project layout

```
app/                    Next.js UI and API routes
  api/github/webhook/   GitHub App webhook handler
  api/reviews/          Create and run reviews
  reviews/              Review list, detail, composer
components/             DiffView, ReviewRunner, Composer
functions/review.ts     Neon Function — long-running agent + JWT auth
lib/review/             Agent, heuristic inspector, diff parser
lib/github-app.ts       App JWT, installation tokens, PR API
lib/github-webhook.ts   Webhook verification and review pipeline
lib/db/                 Drizzle schema and Postgres client
scripts/
  register-github-app.mjs
  dev-github-webhook.mjs
neon.ts                 Neon platform config (auth, bucket, function)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push Drizzle schema to Postgres |
| `npm run github:register` | One-shot GitHub App registration |
| `npm run github:webhook` | smee.io proxy for local webhook delivery |

## Environment variables

Copy `.env.example` to `.env.local`. Most Neon values are injected by `neon checkout` and `neon deploy`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `NEON_AUTH_*` | Managed Better Auth (base URL, JWKS, cookie secret) |
| `AWS_*` | Object Storage credentials for the `diffs` bucket |
| `NEXT_PUBLIC_REVIEW_FN_URL` | Neon Function URL for streaming reviews |
| `APP_URL` | Public app URL (used in review links) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key (preferred for local AI) |
| `NEON_AI_GATEWAY_*` | Fallback model routing via Neon |
| `GITHUB_APP_*` | GitHub App credentials and webhook secret |
| `GITHUB_TOKEN` | Optional PAT for public PR diff fetching |
| `GITHUB_WEBHOOK_PROXY_URL` | Set automatically by `npm run github:webhook` |

## License

Private — see repository settings.
