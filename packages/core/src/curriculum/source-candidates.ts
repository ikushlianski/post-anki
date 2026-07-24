export interface SourceCandidate {
  url: string;
  title: string;
  discoveryTier: string;
}

const HREF_REGEX = /<a\s[^>]*href=["']([^"'#][^"']*)["']/gi;

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
    const normalized = resolved.toString();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    found.push(normalized);
  }

  return found;
}

/**
 * Deduplicates candidates by URL, keeping the first occurrence — so
 * whichever tier ran first in the caller's assembly order "wins" the
 * candidate when more than one tier finds the same URL. Generic so callers
 * can carry extra fields (kind, fetchedText, ...) through the round trip.
 */
export function dedupeSourceCandidates<T extends SourceCandidate>(candidates: T[]): T[] {
  const seen = new Map<string, T>();

  for (const candidate of candidates) {
    if (!seen.has(candidate.url)) {
      seen.set(candidate.url, candidate);
    }
  }

  return Array.from(seen.values());
}
