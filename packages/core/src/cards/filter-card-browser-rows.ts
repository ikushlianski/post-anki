import type { CardBrowserRow } from "@post-anki/shared";

// A plain-text query matched case-insensitively against a row's question,
// answer, concept, or owning topic title. An empty query returns every row.
export function filterCardBrowserRows(
  rows: CardBrowserRow[],
  query: string,
): CardBrowserRow[] {
  const normalized = query.trim().toLowerCase();

  if (normalized === "") {
    return rows;
  }

  return rows.filter(
    (row) =>
      row.prompt.toLowerCase().includes(normalized) ||
      row.answer.toLowerCase().includes(normalized) ||
      row.concept.toLowerCase().includes(normalized) ||
      row.topicTitle.toLowerCase().includes(normalized),
  );
}
