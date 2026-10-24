import { isSafeSourceUrl } from "@post-anki/core";

export const MAX_SOURCE_TEXT_CHARS = 50_000;
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
