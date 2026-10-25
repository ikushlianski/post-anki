import { describe, expect, it } from "vitest";
import {
  createQueryEmbeddingCache,
  createSearchRateLimiter,
  QUERY_CACHE_MAX_ENTRIES,
  QUERY_CACHE_TTL_MS,
} from "./knowledge-bit-browser-matches.guard.js";

describe("meaning search reuse cache", () => {
  it("should reuse the paid result when the same words come back with different spacing and case", () => {
    const cache = createQueryEmbeddingCache();

    cache.set("model-a", "How does the heart pump", [1, 2]);

    expect(cache.get("model-a", "  how does  the HEART pump ")).toEqual([1, 2]);
  });

  it("should not reuse a result after the embedding model setting changes", () => {
    const cache = createQueryEmbeddingCache();

    cache.set("model-a", "heart", [1]);

    expect(cache.get("model-b", "heart")).toBeUndefined();
  });

  it("should forget a result once it is older than the keep time", () => {
    const cache = createQueryEmbeddingCache();

    cache.set("model-a", "heart", [1], 1000);

    expect(cache.get("model-a", "heart", 1000 + QUERY_CACHE_TTL_MS)).toEqual([1]);
    expect(cache.get("model-a", "heart", 1001 + QUERY_CACHE_TTL_MS)).toBeUndefined();
  });

  it("should drop the oldest search when the memory limit is reached", () => {
    const cache = createQueryEmbeddingCache();

    for (let i = 0; i <= QUERY_CACHE_MAX_ENTRIES; i += 1) {
      cache.set("m", `words ${i}`, [i]);
    }

    expect(cache.get("m", "words 0")).toBeUndefined();
    expect(cache.get("m", `words ${QUERY_CACHE_MAX_ENTRIES}`)).toEqual([QUERY_CACHE_MAX_ENTRIES]);
  });
});

describe("meaning search rate limit", () => {
  it("should refuse the 21st new search inside one minute and allow it a minute later", () => {
    const limiter = createSearchRateLimiter();

    for (let i = 0; i < 20; i += 1) {
      expect(limiter.tryAcquire(1000 + i)).toBe(true);
    }

    expect(limiter.tryAcquire(2000)).toBe(false);
    expect(limiter.tryAcquire(61_001)).toBe(true);
  });
});
