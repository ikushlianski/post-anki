// SCENARIO 3: strips query string, fragment, and trailing slash before
// comparison; host is lowercased. Scheme is deliberately dropped from the
// output entirely (not just lowercased) — the spec names host/path
// normalization explicitly and never calls out scheme as a distinguishing
// signal, and http vs. https on the same host+path is the single most
// common "same article, different link" case in practice, so folding them
// together is the safer default for catching real duplicates. Returns null
// for anything that doesn't parse as a URL — callers must never treat null
// as a valid comparison key (two unparsable values are NOT a match).
export function normalizeSourceUrl(raw: string): string | null {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.length > 1 && url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;

  return `${host}${pathname}`;
}

export interface SourceUrlRef {
  id: string;
  normalizedUrl: string | null;
}

export interface ExactUrlDuplicatePair {
  sourceAId: string;
  sourceBId: string;
  normalizedUrl: string;
}

// All same-normalized-URL groupings across the given sources, pair-wise.
// A null normalizedUrl never participates — two sources that both failed to
// normalize are never reported as matching each other. Pairs are returned
// in canonical lexicographic order (sourceAId < sourceBId), same convention
// as findDuplicatePairs, so the DB's partial unique index sees one
// consistent identity for a given pair regardless of input order.
export function findExactUrlDuplicates(sources: SourceUrlRef[]): ExactUrlDuplicatePair[] {
  const idsByUrl = new Map<string, string[]>();

  for (const source of sources) {
    if (source.normalizedUrl === null) {
      continue;
    }

    const ids = idsByUrl.get(source.normalizedUrl) ?? [];
    ids.push(source.id);
    idsByUrl.set(source.normalizedUrl, ids);
  }

  const pairs: ExactUrlDuplicatePair[] = [];

  for (const [normalizedUrl, ids] of idsByUrl) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [sourceAId, sourceBId] = [ids[i]!, ids[j]!].sort();

        pairs.push({ sourceAId: sourceAId!, sourceBId: sourceBId!, normalizedUrl });
      }
    }
  }

  return pairs;
}
