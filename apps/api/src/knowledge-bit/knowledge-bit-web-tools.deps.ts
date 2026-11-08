import { isSafeSourceUrl } from "@post-anki/core";
import type { ModelTier } from "@post-anki/shared";
import { fetchWithTimeout, truncateText } from "../shared/outbound-fetch.js";
import { extractVisibleText } from "../knowledge-source/knowledge-source.controller.js";
import { webSearch } from "../probe/probe-grounding.js";
import { log } from "../shared/log.js";
import { normalizeUrlForComparison } from "./knowledge-bit-url-normalize.js";
import type { KnowledgeBitChatToolsDeps } from "../mastra/knowledge-bit-chat-tools.js";

export { normalizeUrlForComparison };

const PAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_CHARS = 8_000;
const MAX_SEARCH_CHARS = 4_000;

export const WEB_TOOLS_MAX_STEPS = 6;

export interface KnowledgeBitWebToolsOptions {
  knowledgeBitId: string;
  searchOp: string;
  searchPurpose: string;
  maxSearches?: number;
  maxPageFetches?: number;
  forceTier?: ModelTier;
  maxPageChars?: number;
  maxSearchChars?: number;
  seedCitedUrls?: string[];
}

const SEARCH_LIMIT_NOTICE = "Search limit reached for this reply; answer with what you have.";
const REPEAT_QUERY_NOTICE = "You already searched for this; use the earlier result instead of repeating it.";

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface KnowledgeBitWebTools {
  deps: KnowledgeBitChatToolsDeps;
  getSources: () => string[];
  getUsage: () => { searches: number; fetches: number };
}

export function createKnowledgeBitWebTools(options: KnowledgeBitWebToolsOptions): KnowledgeBitWebTools {
  const citedByKey = new Map<string, string>();
  const maxSearches = options.maxSearches ?? Number.POSITIVE_INFINITY;
  const maxPageFetches = options.maxPageFetches ?? Number.POSITIVE_INFINITY;
  const maxPageChars = options.maxPageChars ?? MAX_PAGE_CHARS;
  const maxSearchChars = options.maxSearchChars ?? MAX_SEARCH_CHARS;
  const seenQueries = new Set<string>();
  let searches = 0;
  let fetches = 0;

  for (const url of options.seedCitedUrls ?? []) {
    citedByKey.set(normalizeUrlForComparison(url), url);
  }

  const deps: KnowledgeBitChatToolsDeps = {
    isCitedUrl: (url) => citedByKey.has(normalizeUrlForComparison(url)),
    fetchPage: async (url) => {
      if (fetches >= maxPageFetches) {
        return null;
      }

      fetches += 1;

      try {
        const html = await fetchWithTimeout(url, PAGE_FETCH_TIMEOUT_MS);

        if (html === null) {
          return null;
        }

        return { text: truncateText(extractVisibleText(html), maxPageChars) };
      } catch (err) {
        log.warn({ err, knowledgeBitId: options.knowledgeBitId }, "knowledge_bit_fetch_page_failed");

        return null;
      }
    },
    searchWeb: async (query) => {
      if (searches >= maxSearches) {
        return { text: SEARCH_LIMIT_NOTICE, citations: [] };
      }

      const queryKey = normalizeQuery(query);

      if (seenQueries.has(queryKey)) {
        return { text: REPEAT_QUERY_NOTICE, citations: [] };
      }

      seenQueries.add(queryKey);
      searches += 1;

      const outcome = await webSearch(
        `${options.searchPurpose}: ${query}`,
        options.searchOp,
        { query, knowledgeBitId: options.knowledgeBitId },
        {},
        options.forceTier,
      );

      if (!outcome.ok) {
        return { text: "", citations: [] };
      }

      outcome.citations.forEach((url) => {
        const key = normalizeUrlForComparison(url);

        if (!citedByKey.has(key)) {
          citedByKey.set(key, url);
        }
      });

      return { text: truncateText(outcome.text, maxSearchChars), citations: outcome.citations };
    },
  };

  return {
    deps,
    getSources: () => [...citedByKey.values()].filter((url) => isSafeSourceUrl(url).allowed),
    getUsage: () => ({ searches, fetches }),
  };
}
