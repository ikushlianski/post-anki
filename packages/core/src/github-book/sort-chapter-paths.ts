// Orders chapter paths the way the book itself is numbered
// (01-Part_One/Chapter_1-..., 01-Part_One/Chapter_2-..., 02-Part_Two/...).
// A numeric-aware collator is used rather than plain string comparison so
// unpadded numbering (Chapter_2 vs Chapter_10) still sorts correctly, not
// just the zero-padded case.
export function sortChapterPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}
