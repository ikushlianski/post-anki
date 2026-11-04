import type http from "node:http";
import { isBrowserDateRangeReversed, knowledgeBitBrowserMatchesQuerySchema } from "@post-anki/shared";
import { sendBadGateway, sendError, sendJson, sendInvalidQuery } from "../shared/http.js";
import { log } from "../shared/log.js";
import { EmbeddingFailedError, SearchRateLimitedError } from "./knowledge-bit-browser-matches.errors.js";
import { searchKnowledgeBitBrowserMatches } from "./knowledge-bit-browser-matches.orchestrator.js";

// GET /knowledge-bits/browser/matches
export async function handleKnowledgeBitBrowserMatches(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = knowledgeBitBrowserMatchesQuerySchema.safeParse(
    Object.fromEntries(new URLSearchParams(search)),
  );

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  if (isBrowserDateRangeReversed(parsed.data)) {
    sendError(res, 400, "invalid_date_range", "The from date must not be later than the to date.");
    return;
  }

  try {
    sendJson(res, 200, await searchKnowledgeBitBrowserMatches(parsed.data));
  } catch (err) {
    if (err instanceof SearchRateLimitedError) {
      res.setHeader("Retry-After", "60");
      sendError(res, 429, "search_rate_limited", err.message);
      return;
    }

    if (err instanceof EmbeddingFailedError) {
      log.error({ err }, "knowledge_bit_browser_matches_embedding_failed");
      sendBadGateway(res, "embedding_failed");
      return;
    }

    throw err;
  }
}
