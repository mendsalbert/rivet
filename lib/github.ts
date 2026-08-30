const PR_URL = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

export function parseGithubPr(input: string) {
  const match = input.trim().match(PR_URL);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

export async function fetchGithubPullRequest(url: string) {
  const parsed = parseGithubPr(url);
  if (!parsed) {
    throw new Error("That does not look like a GitHub pull request URL.");
  }

  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "rivet-review-agent",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const api = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`;
  const [metaRes, diffRes] = await Promise.all([
    fetch(api, { headers }),
    fetch(api, { headers: { ...headers, Accept: "application/vnd.github.diff" } }),
  ]);

  if (metaRes.status === 404 || diffRes.status === 404) {
    throw new Error("GitHub could not find that pull request. It may be private.");
  }
  if (!metaRes.ok || !diffRes.ok) {
    throw new Error("GitHub refused the request. Add a GITHUB_TOKEN if you are rate-limited.");
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
