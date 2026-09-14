export interface SourceCandidate {
  url: string;
  title: string;
  discoveryTier: string;
}

const HREF_REGEX = /<a\s[^>]*href=["']([^"'#][^"']*)["']/gi;
const INDEX_FILENAME_REGEX = /\/index\.html?$/i;

// A dedupe key, not a URL to fetch or display — collapses the same page
// reached via http vs https, a trailing slash, or an explicit index.html,
// which the crawler and multiple discovery tiers can each surface
// independently as if they were different pages.
function normalizeForDedupe(url: string): string {
  let normalized: URL;

  try {
    normalized = new URL(url);
  } catch {
    return url;
  }

  normalized.hash = "";
  normalized.protocol = "https:";
  normalized.host = normalized.host.toLowerCase();
  normalized.pathname = normalized.pathname.replace(INDEX_FILENAME_REGEX, "/");

  if (normalized.pathname.length > 1 && normalized.pathname.endsWith("/")) {
    normalized.pathname = normalized.pathname.slice(0, -1);
  }

  return normalized.toString();
}

/**
 * Extracts absolute same-origin URLs from an entry page's raw HTML, capped
 * at `cap` results. Deliberately single-hop (only reads the given `html`,
 * never fetches a discovered link to look further) and same-origin-only —
 * this is the bounded crawl tier's one building block, never a general
 * crawler.
 */
export function extractSameSiteLinks(html: string, origin: string, cap: number): string[] {
  if (cap <= 0) {
    return [];
  }

  let originUrl: URL;

  try {
    originUrl = new URL(origin);
  } catch {
    return [];
  }

  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(HREF_REGEX)) {
    if (found.length >= cap) {
      break;
    }

    const raw = match[1]!;
    let resolved: URL;

    try {
      resolved = new URL(raw, originUrl);
    } catch {
      continue;
    }

    if (resolved.origin !== originUrl.origin) {
      continue;
    }

    resolved.hash = "";
    const rawUrl = resolved.toString();
    const dedupeKey = normalizeForDedupe(rawUrl);

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    found.push(rawUrl);
  }

  return found;
}

/**
 * Deduplicates candidates by normalized URL, keeping the first occurrence —
 * so whichever tier ran first in the caller's assembly order "wins" the
 * candidate when more than one tier finds the same page, even reached via a
 * different scheme, trailing slash, or index filename. Generic so callers
 * can carry extra fields (kind, fetchedText, ...) through the round trip.
 */
export function dedupeSourceCandidates<T extends SourceCandidate>(candidates: T[]): T[] {
  const seen = new Map<string, T>();

  for (const candidate of candidates) {
    const key = normalizeForDedupe(candidate.url);

    if (!seen.has(key)) {
      seen.set(key, candidate);
    }
  }

  return Array.from(seen.values());
}
