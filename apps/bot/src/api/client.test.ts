import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  loadEnv: () => ({ API_BASE_URL: "https://api.example.com", API_SHARED_SECRET: "s" }),
}));

import { API_TIMEOUT_MS, LLM_API_TIMEOUT_MS, getDailyPush, startSocraticSession, getSubjects, submitAnswer, getLearningStats, getMotivationTimeZone, getReviewCounts, resetMotivationTimeZoneCache } from "./client.js";

const fetchMock = vi.fn();

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  resetMotivationTimeZoneCache();
});

function urls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

describe("getMotivationTimeZone", () => {
  it("should read the saved zone once and reuse it within ten minutes", async () => {
    fetchMock.mockResolvedValue(reply({ timeZone: "Australia/Brisbane", timeZoneConfigured: true }));

    expect(await getMotivationTimeZone(1000)).toBe("Australia/Brisbane");
    expect(await getMotivationTimeZone(1000 + 5 * 60 * 1000)).toBe("Australia/Brisbane");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await getMotivationTimeZone(1000 + 11 * 60 * 1000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("should fall back to UTC when the settings cannot be read", async () => {
    fetchMock.mockRejectedValue(new Error("down"));

    expect(await getMotivationTimeZone()).toBe("UTC");
  });
});

describe("tz in count and stats queries", () => {
  it("should count due cards in the saved zone, not UTC", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/motivation/settings")
        ? reply({ timeZone: "Australia/Brisbane", timeZoneConfigured: true })
        : reply({ counts: { new: 0, learning: 0, review: 3 }, cards: [] }),
    );

    await getReviewCounts();

    expect(urls().some((u) => u.includes("/knowledge-bits/review-cards?limit=1&tz=Australia%2FBrisbane"))).toBe(true);
  });

  it("should ask for learning stats in the saved zone", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/motivation/settings")
        ? reply({ timeZone: "Europe/Lisbon", timeZoneConfigured: true })
        : reply({}),
    );

    await getLearningStats().catch(() => undefined);

    expect(urls().some((u) => u.includes("/stats/learning?tz=Europe%2FLisbon&days=7"))).toBe(true);
  });
});

describe("request timeout", () => {
  it("should give every API call a 20 second abort signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(reply({ timeZone: "UTC", timeZoneConfigured: false }));

    await getMotivationTimeZone();

    expect(timeout).toHaveBeenCalledWith(API_TIMEOUT_MS);
    expect(API_TIMEOUT_MS).toBe(20_000);
    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it("should fail instead of waiting forever when the API never answers", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init.signal?.aborted) reject(new Error("aborted"));
        }),
    );

    await expect(getDailyPush("socratic" as never)).rejects.toThrow("aborted");
    timeout.mockRestore();
  });
});

describe("timeout by kind of call", () => {
  it("should give model-backed calls 90 seconds and quick reads 20 seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(reply([]));

    await getSubjects();
    await startSocraticSession({ topicId: "t1" }).catch(() => undefined);
    await getDailyPush("socratic" as never).catch(() => undefined);
    await submitAnswer({ topicId: "t1", gapId: "g", mode: "socratic", answer: "a" } as never).catch(() => undefined);

    expect(timeout.mock.calls.map((c) => c[0])).toEqual([
      API_TIMEOUT_MS,
      LLM_API_TIMEOUT_MS,
      LLM_API_TIMEOUT_MS,
      LLM_API_TIMEOUT_MS,
    ]);
    expect(LLM_API_TIMEOUT_MS).toBe(90_000);
    timeout.mockRestore();
  });
});
