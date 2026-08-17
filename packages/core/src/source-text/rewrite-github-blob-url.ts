// A GitHub blob page (https://github.com/<owner>/<repo>/blob/<ref>/<path>)
// is markdown wrapped in GitHub's entire app shell — global header, repo
// nav, file tree, line-number gutter, Raw/Blame buttons, footer. The same
// content is available with zero chrome from raw.githubusercontent.com, so
// rewriting the URL before fetching is strictly better than extracting
// through the chrome. Any URL that is not a github.com blob URL — already a
// raw.githubusercontent.com URL, a non-GitHub URL, or a non-blob GitHub URL
// (tree, repo root, releases, issues, ...) — is returned unchanged. A query
// string or fragment on the blob URL (view toggles, line-range anchors) is
// dropped, since raw.githubusercontent.com does not use either.
export function rewriteGithubBlobUrl(url: string): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.hostname.toLowerCase() !== "github.com") {
    return url;
  }

  const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);

  if (segments.length < 5 || segments[2] !== "blob") {
    return url;
  }

  const [owner, repo, , ref, ...pathParts] = segments;

  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pathParts.join("/")}`;
}
