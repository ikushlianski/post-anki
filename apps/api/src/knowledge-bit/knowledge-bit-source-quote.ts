import { fencedCodeBlocks } from "@post-anki/shared";
import { hasExactCodeBlocks } from "./knowledge-bit-code-exactness.js";
import { CODE_BLOCK_MAX_CHARS, CODE_BLOCK_MAX_LINES, exceedsLength } from "./knowledge-bit-code-aware-length.js";
export const SOURCE_ITEM_QUOTE_MIN_CHARS = 12;
export const SOURCE_ITEM_QUOTE_MAX_CHARS = 300;
export const SOURCE_ITEM_STATEMENT_MAX_CHARS = 600;

function isCodeQuoteWithinLimits(quote: string, sourceText: string): boolean {
  if (quote.length > CODE_BLOCK_MAX_CHARS || quote.split("\n").length > CODE_BLOCK_MAX_LINES) {
    return false;
  }

  const needle = normalizeForQuoteMatch(quote);

  return fencedCodeBlocks(sourceText).some((block) => normalizeForQuoteMatch(block).includes(needle));
}

export function isQuoteLengthValid(quote: string, sourceText: string): boolean {
  if (exceedsLength(quote, SOURCE_ITEM_QUOTE_MAX_CHARS) && !isCodeQuoteWithinLimits(quote, sourceText)) {
    return false;
  }

  return quote.length >= SOURCE_ITEM_QUOTE_MIN_CHARS || quote === sourceText.trim();
}

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

  return (
    normalizedQuote.length > 0 &&
    normalizeForQuoteMatch(sourceText).includes(normalizedQuote) &&
    hasExactCodeBlocks(quote, sourceText)
  );
}

export function normalizeStatement(statement: string): string {
  return normalizeForQuoteMatch(statement);
}
