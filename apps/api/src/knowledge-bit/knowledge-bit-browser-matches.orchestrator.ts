import type { KnowledgeBitBrowserMatches, KnowledgeBitBrowserMatchesQuery } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import { loadEnv } from "../shared/env.js";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";
import { EmbeddingFailedError, SearchRateLimitedError } from "./knowledge-bit-browser-matches.errors.js";
import { createQueryEmbeddingCache, createSearchRateLimiter } from "./knowledge-bit-browser-matches.guard.js";
import {
  countBrowserMatchesScope,
  rankBrowserMatchesInTransaction,
} from "./knowledge-bit-browser-matches.repo.js";

const queryCache = createQueryEmbeddingCache();
const rateLimiter = createSearchRateLimiter();

export function resetBrowserMatchesGuards(): void {
  queryCache.clear();
  rateLimiter.clear();
}

async function embedWords(words: string, model: string): Promise<number[]> {
  const cached = queryCache.get(model, words);

  if (cached) {
    return cached;
  }

  if (!rateLimiter.tryAcquire()) {
    throw new SearchRateLimitedError();
  }

  try {
    const [embedded] = await embedTexts([{ id: "query", text: words }]);

    if (!embedded) {
      throw new Error("no embedding returned");
    }

    queryCache.set(model, words, embedded.embedding);

    return embedded.embedding;
  } catch (err) {
    if (err instanceof LlmBudgetExceededError) {
      throw err;
    }

    throw new EmbeddingFailedError(err);
  }
}

export async function searchKnowledgeBitBrowserMatches(
  { q, ...filters }: KnowledgeBitBrowserMatchesQuery,
): Promise<KnowledgeBitBrowserMatches> {
  const scope = await countBrowserMatchesScope(filters);

  if (scope.readyCount === 0) {
    return { items: [], capped: false, ...scope };
  }

  const embedding = await embedWords(q, loadEnv().EMBEDDING_MODEL);
  const ranking = await rankBrowserMatchesInTransaction(embedding, filters);

  return { ...ranking, ...scope };
}
