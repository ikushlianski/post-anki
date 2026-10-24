export const SOURCE_ITEM_QUOTE_MIN_CHARS = 12;
export const SOURCE_ITEM_QUOTE_MAX_CHARS = 300;
export const SOURCE_ITEM_STATEMENT_MAX_CHARS = 600;

const QUOTE_MARKS = /["'`«»„“”‟‘’‚‛‹›]/gu;

export function normalizeForQuoteMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(QUOTE_MARKS, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isQuoteInSource(quote: string, sourceText: string): boolean {
  const normalizedQuote = normalizeForQuoteMatch(quote);

  return normalizedQuote.length > 0 && normalizeForQuoteMatch(sourceText).includes(normalizedQuote);
}

export function normalizeStatement(statement: string): string {
  return normalizeForQuoteMatch(statement);
}
