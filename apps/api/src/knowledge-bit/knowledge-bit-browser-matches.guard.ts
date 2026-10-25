export const SEARCHES_PER_MINUTE = 20;
export const SEARCH_WINDOW_MS = 60_000;
export const QUERY_CACHE_TTL_MS = 60 * 60_000;
export const QUERY_CACHE_MAX_ENTRIES = 500;

export function normalizeSearchWords(words: string): string {
  return words.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface QueryEmbeddingCache {
  get(model: string, words: string, now?: number): number[] | undefined;
  set(model: string, words: string, embedding: number[], now?: number): void;
  clear(): void;
}

export function createQueryEmbeddingCache(): QueryEmbeddingCache {
  const entries = new Map<string, { embedding: number[]; storedAt: number }>();
  const keyOf = (model: string, words: string) => `${model}\n${normalizeSearchWords(words)}`;

  return {
    get(model, words, now = Date.now()) {
      const key = keyOf(model, words);
      const entry = entries.get(key);

      if (!entry) {
        return undefined;
      }

      if (now - entry.storedAt > QUERY_CACHE_TTL_MS) {
        entries.delete(key);

        return undefined;
      }

      return entry.embedding;
    },
    set(model, words, embedding, now = Date.now()) {
      const key = keyOf(model, words);

      entries.delete(key);
      entries.set(key, { embedding, storedAt: now });

      while (entries.size > QUERY_CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value;

        if (oldest === undefined) {
          break;
        }

        entries.delete(oldest);
      }
    },
    clear() {
      entries.clear();
    },
  };
}

export interface SearchRateLimiter {
  tryAcquire(now?: number): boolean;
  clear(): void;
}

export function createSearchRateLimiter(limit = SEARCHES_PER_MINUTE, windowMs = SEARCH_WINDOW_MS): SearchRateLimiter {
  let times: number[] = [];

  return {
    tryAcquire(now = Date.now()) {
      times = times.filter((time) => now - time < windowMs);

      if (times.length >= limit) {
        return false;
      }

      times.push(now);

      return true;
    },
    clear() {
      times = [];
    },
  };
}
