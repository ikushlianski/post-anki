import { isSafeSourceUrl } from "@post-anki/core";
import {
  MAX_RELATED_SUGGESTIONS,
  relatedCardSuggestionSchema,
  type RelatedCardSuggestion,
} from "@post-anki/shared";
import { normalizeUrlForComparison } from "./knowledge-bit-url-normalize.js";

const BLOCK_PATTERN = /<related-cards>([\s\S]*?)<\/related-cards>/gi;
const DANGLING_PATTERN = /(?:^|\n)[ \t]*<related-cards>(?:(?!\n[ \t]*\n)[\s\S])*$/i;

export interface ExtractedRelatedCards {
  reply: string;
  suggestions?: RelatedCardSuggestion[];
}

function parseBlocks(text: string): unknown[] {
  const items: unknown[] = [];

  for (const match of text.matchAll(BLOCK_PATTERN)) {
    try {
      const parsed: unknown = JSON.parse(match[1]!.trim());

      if (Array.isArray(parsed)) {
        items.push(...parsed);
      }
    } catch {
      continue;
    }
  }

  return items;
}

function keepCitedSources(sources: string[], citedUrls: string[]): string[] {
  const cited = new Set(citedUrls.map(normalizeUrlForComparison));

  return sources.filter(
    (url) => isSafeSourceUrl(url).allowed && cited.has(normalizeUrlForComparison(url)),
  );
}

export function extractRelatedCards(
  text: string,
  citedUrls: string[],
  searchesUsed: number,
): ExtractedRelatedCards {
  const reply = text.replace(BLOCK_PATTERN, "").replace(DANGLING_PATTERN, "").trim();
  const suggestions: RelatedCardSuggestion[] = [];

  for (const item of parseBlocks(text)) {
    const parsed = relatedCardSuggestionSchema.safeParse(item);

    if (!parsed.success) {
      continue;
    }

    if (parsed.data.origin === "web" && searchesUsed === 0) {
      continue;
    }

    const sources = keepCitedSources(parsed.data.sources, citedUrls);

    if (parsed.data.origin === "web" && sources.length === 0) {
      continue;
    }

    suggestions.push({ ...parsed.data, sources });
  }

  const capped = suggestions.slice(0, MAX_RELATED_SUGGESTIONS);

  return capped.length > 0 ? { reply, suggestions: capped } : { reply };
}
