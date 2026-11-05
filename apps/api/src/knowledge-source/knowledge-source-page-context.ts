import { isSafeSourceUrl } from "@post-anki/core";
import {
  KNOWLEDGE_SOURCE_MAX_CHARS,
  mergeHighlights,
  shiftHighlights,
  type KnowledgeHighlight,
} from "@post-anki/shared";

export const MAX_SOURCE_TEXT_CHARS = KNOWLEDGE_SOURCE_MAX_CHARS;
export const MAX_PAGE_URL_CHARS = 2048;
export const MAX_PAGE_TITLE_CHARS = 300;

export function safePageUrl(sourceUrl: string | undefined): string | null {
  if (sourceUrl === undefined) {
    return null;
  }

  const candidate = sourceUrl.trim();

  return candidate.length > 0 && isSafeSourceUrl(candidate).allowed ? candidate : null;
}

export function withPageTitle(text: string, title: string | undefined): string {
  const cleanTitle = (title ?? "").replace(/\s+/g, " ").trim();

  if (cleanTitle.length === 0) {
    return text;
  }

  return `Page: ${cleanTitle}\n${text}`.slice(0, MAX_SOURCE_TEXT_CHARS);
}

export function withPageTitleKeepingText(text: string, title: string | undefined): string {
  const cleanTitle = (title ?? "").replace(/\s+/g, " ").trim();
  const titled = `Page: ${cleanTitle}\n${text}`;

  return cleanTitle.length === 0 || titled.length > MAX_SOURCE_TEXT_CHARS ? text : titled;
}

export function highlightsForStoredText(
  highlights: readonly KnowledgeHighlight[],
  title: string | undefined,
  storedLength: number,
): KnowledgeHighlight[] {
  const cleanTitle = (title ?? "").replace(/\s+/g, " ").trim();
  const offset = cleanTitle.length === 0 ? 0 : `Page: ${cleanTitle}\n`.length;

  return mergeHighlights(shiftHighlights(highlights, offset))
    .map((range) => ({ start: range.start, end: Math.min(range.end, storedLength) }))
    .filter((range) => range.start < range.end);
}
