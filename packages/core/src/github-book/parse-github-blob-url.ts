export interface ParsedGithubBlobUrl {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

// Mirrors the segment shape rewriteGithubBlobUrl (source-text) already
// recognizes (github.com, /<owner>/<repo>/blob/<ref>/<path...>), but returns
// the parsed components instead of a rewritten URL — this module needs the
// owner/repo/ref to call the GitHub Trees API and the decoded path to
// compare against paths the API itself returns (which are never
// percent-encoded). Any URL that is not a github.com blob URL yields null.
export function parseGithubBlobUrl(url: string): ParsedGithubBlobUrl | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname.toLowerCase() !== "github.com") {
    return null;
  }

  const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);

  if (segments.length < 5 || segments[2] !== "blob") {
    return null;
  }

  const [owner, repo, , ref, ...pathParts] = segments;
  const decodedParts: string[] = [];

  for (const part of pathParts) {
    const decoded = decodeUriSegment(part);

    if (decoded === null) {
      return null;
    }

    decodedParts.push(decoded);
  }

  return { owner: owner!, repo: repo!, ref: ref!, path: decodedParts.join("/") };
}

// The inverse of the decoding above: turns a raw repository path (as
// returned by the GitHub Trees API, e.g. containing literal parentheses)
// back into a URL that is safe to fetch.
export function buildGithubBlobUrl(owner: string, repo: string, ref: string, path: string): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://github.com/${owner}/${repo}/blob/${ref}/${encodedPath}`;
}

export function buildGithubTreeApiUrl(owner: string, repo: string, ref: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
}

function decodeUriSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
