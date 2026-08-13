import { deriveTitleFromUrl } from "./derive-title-from-url";
import type { SeriesPart } from "./plan-series-modules";

export interface KnownSeriesPartsInput {
  readonly discoveredChapters: readonly SeriesPart[];
  readonly siblingUrls: readonly string[];
  readonly capturedUrl: string;
  readonly capturedTitle: string | null;
}

// Two sources can ever supply "known" parts for a series: a code host's own
// chapter listing (github-chapters.ts, via discoverGithubChapters) or the
// sibling URLs a classifier read off the page itself (already
// safety-validated before they ever reach here — see
// learning-list-classification.orchestrator.ts's safeSiblingUrls). When both
// are available the discovered chapters win outright: they come from the
// repository's own file tree, not a model's reading of a page, so they are
// verified rather than merely plausible. Sibling-derived parts have no
// titles of their own — deriveTitleFromUrl gives every one of them (and the
// captured URL itself, when its own classified title is missing) a readable
// name from its own path.
export function resolveKnownSeriesParts(input: KnownSeriesPartsInput): SeriesPart[] {
  if (input.discoveredChapters.length > 0) {
    return [...input.discoveredChapters];
  }

  if (input.siblingUrls.length === 0) {
    return [];
  }

  const capturedTitle = input.capturedTitle?.trim() ?? "";
  const capturedPart: SeriesPart = {
    url: input.capturedUrl,
    title: capturedTitle.length > 0 ? capturedTitle : deriveTitleFromUrl(input.capturedUrl),
  };

  const siblingParts = input.siblingUrls.map((url) => ({ url, title: deriveTitleFromUrl(url) }));

  return disambiguateTitles([capturedPart, ...siblingParts]);
}

// Two structurally different documents can de-slugify to the same title —
// "/guide/index.html" and "/guide/introduction.html" both step back to their
// shared parent segment (see deriveTitleFromUrl's filler-skip rule). Module
// title is the join key a later slice generation pass uses to pair a module
// with its own source document (slice-generation.orchestrator.ts's
// `sourceByTitle`), so a collision here would silently pair a module with
// the wrong sibling's text instead of erroring. Numbering every title past
// the first occurrence keeps that join one-to-one no matter how the pages
// happen to be named.
function disambiguateTitles(parts: SeriesPart[]): SeriesPart[] {
  const occurrences = new Map<string, number>();

  return parts.map((part) => {
    const seen = (occurrences.get(part.title) ?? 0) + 1;

    occurrences.set(part.title, seen);

    return seen === 1 ? part : { ...part, title: `${part.title} (${seen})` };
  });
}
