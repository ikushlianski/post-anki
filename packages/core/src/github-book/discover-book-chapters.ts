import { buildGithubBlobUrl } from "./parse-github-blob-url";
import { deriveChapterTitle } from "./derive-chapter-title";
import { isChapterCandidatePath } from "./is-chapter-candidate-path";
import { sortChapterPaths } from "./sort-chapter-paths";
import type { GithubTreeEntry } from "./github-tree-schema";

// Same order of magnitude as MAX_CAPTURED_SIBLINGS in
// learning-list-classification.orchestrator.ts (12) — this bounds the
// discovered book's chapter list itself (the captured chapter plus its
// siblings), so the two caps land on comparable course sizes even though
// they're applied at different points in the pipeline.
export const MAX_DISCOVERED_CHAPTERS = 12;

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
    .filter((entry) => entry.type === "blob" && isChapterCandidatePath(entry.path))
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
