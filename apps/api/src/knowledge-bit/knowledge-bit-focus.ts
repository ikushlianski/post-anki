import type { KnowledgeHighlight } from "@post-anki/shared";
import type { SourceChunk } from "./knowledge-bit-source-chunking.js";
import { normalizeForQuoteMatch } from "./knowledge-bit-source-quote.js";

const MIN_FALLBACK_MATCH_CHARS = 8;

export function markedRangesInChunk(chunk: SourceChunk, highlights: readonly KnowledgeHighlight[]): KnowledgeHighlight[] {
  const ranges: KnowledgeHighlight[] = [];

  for (const segment of chunk.segments) {
    const segmentEnd = segment.sourceStart + segment.length;

    for (const mark of highlights) {
      const start = Math.max(mark.start, segment.sourceStart);
      const end = Math.min(mark.end, segmentEnd);

      if (start >= end) {
        continue;
      }

      const from = segment.chunkOffset + (start - segment.sourceStart);
      const to = segment.chunkOffset + (end - segment.sourceStart);

      if (chunk.text.slice(from, to).trim().length > 0) {
        ranges.push({ start: from, end: to });
      }
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

export function focusExcerpts(chunkText: string, ranges: readonly KnowledgeHighlight[]): string[] {
  return ranges.map((range) => chunkText.slice(range.start, range.end).trim()).filter((excerpt) => excerpt.length > 0);
}

export function quoteOverlapsFocus(quote: string, chunkText: string, ranges: readonly KnowledgeHighlight[]): boolean {
  if (ranges.length === 0) {
    return true;
  }

  let found = false;

  for (let at = chunkText.indexOf(quote); at >= 0; at = chunkText.indexOf(quote, at + 1)) {
    found = true;

    const end = at + quote.length;

    if (ranges.some((range) => range.start < end && range.end > at)) {
      return true;
    }
  }

  if (found) {
    return false;
  }

  const normalizedQuote = normalizeForQuoteMatch(quote);

  return focusExcerpts(chunkText, ranges).some((excerpt) => {
    const normalizedExcerpt = normalizeForQuoteMatch(excerpt);

    return (
      Math.min(normalizedExcerpt.length, normalizedQuote.length) >= MIN_FALLBACK_MATCH_CHARS &&
      (normalizedExcerpt.includes(normalizedQuote) || normalizedQuote.includes(normalizedExcerpt))
    );
  });
}

export interface FocusedChunk {
  chunk: string;
  index: number;
  focus: KnowledgeHighlight[];
}

export function planFocusedChunks(
  chunks: readonly SourceChunk[],
  highlights: readonly KnowledgeHighlight[] | null | undefined,
): FocusedChunk[] {
  const all = chunks.map((chunk, index) => ({
    chunk: chunk.text,
    index,
    focus: highlights && highlights.length > 0 ? markedRangesInChunk(chunk, highlights) : [],
  }));

  return highlights && highlights.length > 0 ? all.filter((entry) => entry.focus.length > 0) : all;
}
