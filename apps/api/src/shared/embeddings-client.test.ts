import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let envOverrides: Record<string, unknown> = {};

vi.mock("./env.js", () => ({
  loadEnv: () => ({
    OPENROUTER_API_KEY: "test-key",
    EMBEDDING_MODEL: "openai/text-embedding-3-small",
    ...envOverrides,
  }),
}));

vi.mock("./log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function mockFetchOnce(response: unknown, status = 200) {
  const spy = vi.fn(
    async () =>
      new Response(JSON.stringify(response), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );

  vi.stubGlobal("fetch", spy);

  return spy;
}

describe("embedTexts", () => {
  beforeEach(() => {
    envOverrides = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns an empty array with no fetch call for empty input", async () => {
    const spy = mockFetchOnce({ data: [] });
    const { embedTexts } = await import("./embeddings-client.js");

    const result = await embedTexts([]);

    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps results back to items by the response's own index, not array position", async () => {
    // Deliberately shuffled order in the response — item 0's embedding is
    // reported last, item 2's first, to prove index-based mapping is real.
    mockFetchOnce({
      data: [
        { index: 2, embedding: [3, 3] },
        { index: 0, embedding: [1, 1] },
        { index: 1, embedding: [2, 2] },
      ],
    });
    const { embedTexts } = await import("./embeddings-client.js");

    const result = await embedTexts([
      { id: "a", text: "first" },
      { id: "b", text: "second" },
      { id: "c", text: "third" },
    ]);

    expect(result).toEqual([
      { id: "a", embedding: [1, 1] },
      { id: "b", embedding: [2, 2] },
      { id: "c", embedding: [3, 3] },
    ]);
  });

  it("retries on a failed attempt and succeeds on the next", async () => {
    let calls = 0;
    const spy = vi.fn(async () => {
      calls += 1;

      if (calls === 1) {
        return new Response("server error", { status: 500 });
      }

      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [9] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", spy);
    const { embedTexts } = await import("./embeddings-client.js");

    const result = await embedTexts([{ id: "a", text: "x" }]);

    expect(result).toEqual([{ id: "a", embedding: [9] }]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("throws after the retry budget is exhausted", async () => {
    mockFetchOnce("still failing", 500);
    const { embedTexts } = await import("./embeddings-client.js");

    await expect(embedTexts([{ id: "a", text: "x" }])).rejects.toThrow();
  });
});
