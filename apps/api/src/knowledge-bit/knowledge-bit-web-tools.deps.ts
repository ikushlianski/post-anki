import { isSafeSourceUrl } from "@post-anki/core";
import { fetchWithTimeout, truncateText } from "../shared/outbound-fetch.js";
import { extractVisibleText } from "../knowledge-source/knowledge-source.controller.js";
import { webSearch } from "../probe/probe-grounding.js";
import { log } from "../shared/log.js";
import type { KnowledgeBitChatToolsDeps } from "../mastra/knowledge-bit-chat-tools.js";

const PAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_CHARS = 8_000;

export const WEB_TOOLS_MAX_STEPS = 6;

export interface KnowledgeBitWebToolsOptions {
  knowledgeBitId: string;
  searchOp: string;
  searchPurpose: string;
}

export interface KnowledgeBitWebTools {
  deps: KnowledgeBitChatToolsDeps;
  getSources: () => string[];
}

export function normalizeUrlForComparison(url: string): string {
  try {
    const parsed = new URL(url);

    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();

    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : "";

    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

export function createKnowledgeBitWebTools(options: KnowledgeBitWebToolsOptions): KnowledgeBitWebTools {
  const citedByKey = new Map<string, string>();

  const deps: KnowledgeBitChatToolsDeps = {
    isCitedUrl: (url) => citedByKey.has(normalizeUrlForComparison(url)),
    fetchPage: async (url) => {
      try {
        const html = await fetchWithTimeout(url, PAGE_FETCH_TIMEOUT_MS);

        if (html === null) {
          return null;
        }

        return { text: truncateText(extractVisibleText(html), MAX_PAGE_CHARS) };
      } catch (err) {
        log.warn({ err, knowledgeBitId: options.knowledgeBitId }, "knowledge_bit_fetch_page_failed");

        return null;
      }
    },
    searchWeb: async (query) => {
      const outcome = await webSearch(`${options.searchPurpose}: ${query}`, options.searchOp, {
        query,
        knowledgeBitId: options.knowledgeBitId,
      });

      if (!outcome.ok) {
        return { text: "", citations: [] };
      }

      outcome.citations.forEach((url) => {
        const key = normalizeUrlForComparison(url);

        if (!citedByKey.has(key)) {
          citedByKey.set(key, url);
        }
      });

      return { text: outcome.text, citations: outcome.citations };
    },
  };

  return {
    deps,
    getSources: () => [...citedByKey.values()].filter((url) => isSafeSourceUrl(url).allowed),
  };
}
