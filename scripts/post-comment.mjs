// Create or update the single flipfactor comment on a pull request.
// Needs GITHUB_TOKEN with pull-requests: write, GITHUB_REPOSITORY, FF_PR, FF_MARKDOWN.
import { readFileSync } from "node:fs";

const MARKER = "<!-- flipfactor-report -->";
const { GITHUB_TOKEN, GITHUB_REPOSITORY, FF_PR, FF_MARKDOWN } = process.env;
const api = process.env.GITHUB_API_URL ?? "https://api.github.com";

async function gh(method, path, body) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !FF_PR || !FF_MARKDOWN) {
    console.log("flipfactor: not a pull request run, skipping the comment");
    return;
  }
  const body = readFileSync(FF_MARKDOWN, "utf8");
  let existing;
  for (let page = 1; page <= 10 && !existing; page++) {
    const comments = await gh("GET", `/repos/${GITHUB_REPOSITORY}/issues/${FF_PR}/comments?per_page=100&page=${page}`);
    existing = comments.find((c) => typeof c.body === "string" && c.body.startsWith(MARKER));
    if (comments.length < 100) break;
  }
  if (existing) {
    await gh("PATCH", `/repos/${GITHUB_REPOSITORY}/issues/comments/${existing.id}`, { body });
    console.log(`flipfactor: updated comment ${existing.html_url}`);
  } else {
    const created = await gh("POST", `/repos/${GITHUB_REPOSITORY}/issues/${FF_PR}/comments`, { body });
    console.log(`flipfactor: posted ${created.html_url}`);
  }
}

main().catch((err) => {
  // A fork's read-only token cannot comment; the job summary still has the report.
  console.log(`::warning::flipfactor could not comment: ${err.message}`);
});
