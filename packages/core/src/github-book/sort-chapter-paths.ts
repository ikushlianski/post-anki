// Orders chapter paths the way the book itself is numbered
// (01-Part_One/Chapter_1-..., 01-Part_One/Chapter_2-..., 02-Part_Two/...).
// Ordering has to be numeric, not lexicographic: a directory or a chapter
// that reaches double digits (Chapter_10) would otherwise sort ahead of
// single digits it should follow (Chapter_8), and with it every chapter
// after it.
//
// This is a hand-rolled natural-sort comparator: each path is split into
// alternating digit and non-digit chunks, digit chunks are compared as
// numbers and text chunks as case-insensitive strings. It intentionally does
// not lean on Intl.Collator's { numeric: true } option — even though that
// option also compares digit runs numerically, its behavior is defined to
// depend on the ICU data available in the runtime, which differs between
// local dev, CI and the deployed container, so it is not a safe foundation
// for something as visible as chapter order. Comparing full paths
// chunk-by-chunk also means a directory prefix ("01-", "02-") and a chapter
// number inside the filename both get their numeric due without any
// special-casing: the directory chunk is compared before the loop ever
// reaches the filename's own chapter-number chunk.
//
// A repository with no numbers anywhere in its paths still gets a stable,
// sensible ordering: with no digit chunks to compare, every chunk is text,
// so this degrades to plain case-insensitive string comparison — the same
// order plain path sorting would have given.
const PATH_CHUNK_PATTERN = /\d+|\D+/g;
const DIGITS_ONLY_PATTERN = /^\d+$/;

export function sortChapterPaths(paths: string[]): string[] {
  return [...paths].sort(compareChapterPaths);
}

function compareChapterPaths(a: string, b: string): number {
  const aChunks = a.match(PATH_CHUNK_PATTERN) ?? [];
  const bChunks = b.match(PATH_CHUNK_PATTERN) ?? [];
  const length = Math.max(aChunks.length, bChunks.length);

  for (let index = 0; index < length; index += 1) {
    const aChunk = aChunks[index];
    const bChunk = bChunks[index];

    if (aChunk === undefined) {
      return -1;
    }

    if (bChunk === undefined) {
      return 1;
    }

    const comparison = compareChunk(aChunk, bChunk);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function compareChunk(a: string, b: string): number {
  if (DIGITS_ONLY_PATTERN.test(a) && DIGITS_ONLY_PATTERN.test(b)) {
    return Number(a) - Number(b);
  }

  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower < bLower) {
    return -1;
  }

  if (aLower > bLower) {
    return 1;
  }

  return 0;
}
