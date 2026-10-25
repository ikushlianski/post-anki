import type http from "node:http";
import { isBrowserDateRangeReversed, knowledgeBitBrowserMatchesQuerySchema } from "@post-anki/shared";
import { sendError, sendJson } from "../shared/http.js";
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
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues });
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
      sendError(res, 502, "embedding_failed", err.message);
      return;
    }

    throw err;
  }
}
