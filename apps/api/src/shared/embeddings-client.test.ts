import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let envOverrides: Record<string, unknown> = {};

const { recordLlmCallEventMock } = vi.hoisted(() => ({
  recordLlmCallEventMock: vi.fn(),
}));

vi.mock("./llm-daily-spend.repo.js", () => ({
  readDailySpendUsd: async () => 0,
  addDailySpendUsd: async (_day: string, cost: number) => cost,
}));

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

vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: recordLlmCallEventMock,
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
    recordLlmCallEventMock.mockReset();
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
    expect(recordLlmCallEventMock).not.toHaveBeenCalled();
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
    expect(recordLlmCallEventMock).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        curriculumId: null,
        op: "embedTexts",
        success: true,
        errorMessage: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("records the prompt and total token counts the endpoint reports", async () => {
    mockFetchOnce({
      data: [{ index: 0, embedding: [1, 1] }],
      usage: { prompt_tokens: 12, total_tokens: 15 },
    });
    const { embedTexts } = await import("./embeddings-client.js");

    await embedTexts([{ id: "a", text: "first" }]);

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 12,
        completionTokens: null,
        totalTokens: 15,
      }),
    );
  });

  it("retries on a failed attempt and succeeds on the next", async () => {
    let calls = 0;
    const spy = vi.fn(async () => {
      calls += 1;

      if (calls === 1) {
        return new Response("server error", { status: 500 });
      }

      return new Response(
        JSON.stringify({ data: [{ index: 0, embedding: [9] }] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    vi.stubGlobal("fetch", spy);
    const { embedTexts } = await import("./embeddings-client.js");

    const result = await embedTexts([{ id: "a", text: "x" }]);

    expect(result).toEqual([{ id: "a", embedding: [9] }]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("throws after the retry budget is exhausted", async () => {
    const spy = mockFetchOnce("still failing", 500);
    const { embedTexts } = await import("./embeddings-client.js");

    await expect(embedTexts([{ id: "a", text: "x" }])).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(3);
    expect(recordLlmCallEventMock).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        curriculumId: null,
        op: "embedTexts",
        success: false,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("does not retry a 400-class non-429 failure and records it", async () => {
    const spy = mockFetchOnce("bad request", 401);
    const { embedTexts } = await import("./embeddings-client.js");

    await expect(embedTexts([{ id: "a", text: "x" }])).rejects.toThrow(/401/);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEventMock).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        curriculumId: null,
        op: "embedTexts",
        success: false,
        errorMessage: expect.stringContaining("401"),
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("caps an oversized text before sending so the provider never sees it in full", async () => {
    const spy = mockFetchOnce({ data: [{ index: 0, embedding: [1] }] });
    const { embedTexts, MAX_EMBEDDING_INPUT_CHARS } =
      await import("./embeddings-client.js");

    await embedTexts([
      { id: "a", text: "я".repeat(MAX_EMBEDDING_INPUT_CHARS * 3) },
    ]);

    const body = JSON.parse(
      (spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );

    expect(body.input[0]).toHaveLength(MAX_EMBEDDING_INPUT_CHARS);
  });

  it("still returns embeddings for the other items when one item is rejected", async () => {
    const spy = vi.fn(async (_url: string, init: RequestInit) => {
      const { input } = JSON.parse(init.body as string) as { input: string[] };

      if (input.includes("bad")) {
        return new Response("input too long", { status: 400 });
      }

      return new Response(
        JSON.stringify({
          data: input.map((_, index) => ({ index, embedding: [index + 7] })),
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", spy);
    const { embedTexts } = await import("./embeddings-client.js");

    const result = await embedTexts([
      { id: "a", text: "ok" },
      { id: "b", text: "bad" },
      { id: "c", text: "fine" },
    ]);

    expect(result).toEqual([
      { id: "a", embedding: [7] },
      { id: "c", embedding: [7] },
    ]);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining("item b"),
      }),
    );
    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("throws when every item in a multi-item batch is rejected", async () => {
    const spy = mockFetchOnce("too long", 400);
    const { embedTexts } = await import("./embeddings-client.js");

    await expect(
      embedTexts([
        { id: "a", text: "x" },
        { id: "b", text: "y" },
      ]),
    ).rejects.toThrow(/400/);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("does not split a batch on a 5xx and keeps the same retry budget", async () => {
    const spy = mockFetchOnce("down", 500);
    const { embedTexts } = await import("./embeddings-client.js");

    await expect(
      embedTexts([
        { id: "a", text: "x" },
        { id: "b", text: "y" },
      ]),
    ).rejects.toThrow(/500/);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
