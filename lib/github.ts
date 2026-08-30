import {
  fetchPullRequestWithToken,
  getInstallationToken,
  getRepoInstallation,
  isGithubAppConfigured,
} from "@/lib/github-app";

const PR_URL = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

export function parseGithubPr(input: string) {
  const match = input.trim().match(PR_URL);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

async function personalOrAppToken(owner: string, repo: string) {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (!isGithubAppConfigured()) return null;
  const installationId = await getRepoInstallation(owner, repo);
  if (!installationId) return null;
  return getInstallationToken(installationId);
}

export async function fetchGithubPullRequest(url: string) {
  const parsed = parseGithubPr(url);
  if (!parsed) {
    throw new Error("That does not look like a GitHub pull request URL.");
  }

  const token = await personalOrAppToken(parsed.owner, parsed.repo);
  if (token && isGithubAppConfigured()) {
    try {
      const pr = await fetchPullRequestWithToken(
        parsed.owner,
        parsed.repo,
        parsed.number,
        token,
      );
      return {
        title: pr.title,
        sourceUrl: pr.sourceUrl,
        repo: pr.repo,
        prNumber: pr.prNumber,
        diff: pr.diff,
      };
    } catch {
      // Fall through to public/token fetch below.
    }
  }

  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "rivet-review-agent",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const api = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`;
  const [metaRes, diffRes] = await Promise.all([
    fetch(api, { headers }),
    fetch(api, { headers: { ...headers, Accept: "application/vnd.github.diff" } }),
  ]);

  if (metaRes.status === 404 || diffRes.status === 404) {
    throw new Error(
      "GitHub could not find that pull request. Install the Rivet GitHub App on the repo, or check that it is public.",
    );
  }
  if (!metaRes.ok || !diffRes.ok) {
    throw new Error("GitHub refused the request. Install the Rivet app or set GITHUB_TOKEN.");
  }

  const meta = (await metaRes.json()) as {
    title: string;
    html_url: string;
    user?: { login: string };
  };
  const diff = await diffRes.text();
  if (!diff.trim()) {
    throw new Error("That pull request has an empty diff.");
  }

  return {
    title: meta.title || `PR #${parsed.number}`,
    sourceUrl: meta.html_url,
    repo: `${parsed.owner}/${parsed.repo}`,
    prNumber: parsed.number,
    diff,
  };
}
