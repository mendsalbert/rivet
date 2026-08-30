# Rivet

An AI code review agent. The agent is the product. Neon is the backend: Auth, Object Storage, Functions, AI Gateway, and Postgres — declared in one `neon.ts`.

This is the Video 1 MVP: paste a GitHub PR or a unified diff, watch Rivet walk the patch and cite lines.

## Run the demo locally

No Neon project required. Reviews live in memory until the server restarts. The inspector walks the patch without an LLM.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **See a review** — a finished pass over a deliberately broken checkout route.
- **Open the agent** → **Load the checkout patch** — same diff, streamed live.

You can also paste any unified diff or a public GitHub pull request URL.

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
npx drizzle-kit push
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

## What maps to which Neon piece

| What Rivet does | Neon |
| --- | --- |
| Who owns the review | Managed Better Auth (`auth: true`) |
| The patch file | Object Storage bucket `diffs` |
| Walking the diff / model calls | Function `review` + AI Gateway |
| Verdict and findings | Postgres via Drizzle |

The whole backend is `neon.ts`. `neon deploy` provisions it.
