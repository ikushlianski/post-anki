import { describe, expect, it } from "vitest";
import { resolveFetchState } from "./fetch-state";

describe("resolveFetchState", () => {
  it("returns never_fetched when lastFetchedAt is null, regardless of fetchedText", () => {
    expect(
      resolveFetchState({ fetchedText: null, lastFetchedAt: null, lastFetchOutcome: null }),
    ).toBe("never_fetched");
  });

  it("returns fetched when the most recent attempt outcome is ok", () => {
    expect(
      resolveFetchState({
        fetchedText: "some body",
        lastFetchedAt: "2026-01-01T00:00:00.000Z",
        lastFetchOutcome: "ok",
      }),
    ).toBe("fetched");
  });

  it("returns stale_failed when a fetch was attempted but the outcome was not ok", () => {
    expect(
      resolveFetchState({
        fetchedText: null,
        lastFetchedAt: "2026-01-01T00:00:00.000Z",
        lastFetchOutcome: "http_error",
      }),
    ).toBe("stale_failed");
  });

  it("returns stale_failed once a later re-fetch fails, even though an earlier fetch succeeded", () => {
    expect(
      resolveFetchState({
        fetchedText: "old, still-usable body",
        lastFetchedAt: "2026-02-01T00:00:00.000Z",
        lastFetchOutcome: "network_error",
      }),
    ).toBe("stale_failed");
  });

  it("treats blocked the same as any other non-ok outcome", () => {
    expect(
      resolveFetchState({
        fetchedText: null,
        lastFetchedAt: "2026-01-01T00:00:00.000Z",
        lastFetchOutcome: "blocked",
      }),
    ).toBe("stale_failed");
  });
});
