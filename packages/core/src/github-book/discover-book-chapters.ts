import { buildGithubBlobUrl } from "./parse-github-blob-url";
import { deriveChapterTitle } from "./derive-chapter-title";
import { isChapterCandidatePath } from "./is-chapter-candidate-path";
import { sortChapterPaths } from "./sort-chapter-paths";
import type { GithubTreeEntry } from "./github-tree-schema";

// Bounds the discovered book's chapter list itself (the captured chapter
// plus its siblings). A real book needs real headroom here: the
// Agentic-Design-Patterns fixture below alone needs 31 slots (3 substantive
// front-matter entries once ceremonial ones are excluded, 21 numbered
// chapters, 7 appendices) just to avoid truncating mid-book, and other real
// books run longer still. 40 comfortably covers that shape with headroom to
// spare, while still being a fixed, reviewable bound rather than "however
// many files GitHub returns" — a pathological monorepo with hundreds of
// markdown files is still capped.
//
// This number is not just a discovery-side concern: downstream,
// QUESTIONS_PER_KNOWN_SERIES_PART funds one release of quiz questions per
// known part (see generation-constants.ts), so this cap is also the upper
// bound on generated questions for a book-shaped course — raising it here
// raises that ceiling too (worst case, MAX_DISCOVERED_CHAPTERS *
// QUESTIONS_PER_KNOWN_SERIES_PART questions). MAX_CAPTURED_SIBLINGS in
// learning-list-classification.orchestrator.ts (12) is a separate, smaller
// bound applied later in the pipeline and is deliberately not kept in lock
// step with this one.
export const MAX_DISCOVERED_CHAPTERS = 40;

export interface DiscoveredChapter {
  path: string;
  title: string;
  url: string;
}

export interface DiscoverBookChaptersInput {
  owner: string;
  repo: string;
  ref: string;
  entries: GithubTreeEntry[];
  truncated: boolean;
}

export interface DiscoverBookChaptersResult {
  chapters: DiscoveredChapter[];
  truncated: boolean;
  capped: boolean;
}

export function discoverBookChapters(input: DiscoverBookChaptersInput): DiscoverBookChaptersResult {
  const candidatePaths = input.entries
    .filter((entry) => entry.type === "blob" && isChapterCandidatePath(entry.path, input.repo))
    .map((entry) => entry.path);
  const sortedPaths = sortChapterPaths(candidatePaths);
  const capped = sortedPaths.length > MAX_DISCOVERED_CHAPTERS;
  const limitedPaths = sortedPaths.slice(0, MAX_DISCOVERED_CHAPTERS);

  const chapters = limitedPaths.map((path) => ({
    path,
    title: deriveChapterTitle(basename(path)),
    url: buildGithubBlobUrl(input.owner, input.repo, input.ref, path),
  }));

  return { chapters, truncated: input.truncated, capped };
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}
