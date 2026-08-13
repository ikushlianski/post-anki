import {
  buildGithubTreeApiUrl,
  discoverBookChapters,
  githubTreeResponseSchema,
  parseGithubBlobUrl,
  type DiscoveredChapter,
} from "@post-anki/core";
import { guardedFetchText } from "../shared/guarded-fetch.js";

export interface GithubChapterDiscoveryResult {
  chapters: DiscoveredChapter[];
  truncated: boolean;
  capped: boolean;
}

const NO_CHAPTERS_DISCOVERED: GithubChapterDiscoveryResult = {
  chapters: [],
  truncated: false,
  capped: false,
};

// Chapter discovery must never fail capture. A non-GitHub URL, an
// unauthenticated-rate-limited or missing repository, a network failure, or
// a malformed API response all degrade to "no chapters discovered" so the
// normal single-article classification path proceeds untouched.
export async function discoverGithubChapters(url: string): Promise<GithubChapterDiscoveryResult> {
  const parsed = parseGithubBlobUrl(url);

  if (parsed === null) {
    return NO_CHAPTERS_DISCOVERED;
  }

  const fetched = await guardedFetchText(buildGithubTreeApiUrl(parsed.owner, parsed.repo, parsed.ref));

  if (!fetched.ok) {
    return NO_CHAPTERS_DISCOVERED;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(fetched.text);
  } catch {
    return NO_CHAPTERS_DISCOVERED;
  }

  const tree = githubTreeResponseSchema.safeParse(payload);

  if (!tree.success) {
    return NO_CHAPTERS_DISCOVERED;
  }

  return discoverBookChapters({
    owner: parsed.owner,
    repo: parsed.repo,
    ref: parsed.ref,
    entries: tree.data.tree,
    truncated: tree.data.truncated,
  });
}
