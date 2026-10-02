import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({ OPENROUTER_API_KEY: "test-key", OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const resolveEffectiveModelTierImpl = vi.fn().mockResolvedValue("standard");

vi.mock("../mastra/tier-resolver.js", () => ({
  resolveEffectiveModelTier: (...args: unknown[]) => resolveEffectiveModelTierImpl(...args),
}));

vi.mock("../mastra/model-tier.js", () => ({
  tierToModelId: () => "openrouter/some-model",
}));

const recordLlmCallEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: (...args: unknown[]) => recordLlmCallEvent(...args),
}));

const { gatherTechResearchGrounding, resolveOfficialDocsUrl, gatherTrustedSourceCandidates } =
  await import("./tech-research-grounding.js");

function chatResponseWith(
  urls: (string | undefined)[],
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
): unknown {
  return {
    choices: [
      {
        message: {
          content: "grounding text",
          annotations: urls.map((url) => ({ url_citation: { url } })),
        },
      },
    ],
    usage,
  };
}

describe("gatherTechResearchGrounding citation safety", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveModelTierImpl.mockResolvedValue("standard");
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("drops unsafe citation URLs before returning grounding to a caller", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        chatResponseWith([
          "https://example.com/real-source",
          "javascript:alert(1)",
          "http://169.254.169.254/latest/meta-data",
        ]),
    }) as unknown as typeof fetch;

    const result = await gatherTechResearchGrounding("SomeTech");

    expect(result.citations).toEqual(["https://example.com/real-source"]);
  });

  it("keeps a normal https citation intact", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chatResponseWith(["https://example.com/docs"]),
    }) as unknown as typeof fetch;

    const result = await gatherTechResearchGrounding("SomeTech");

    expect(result.citations).toEqual(["https://example.com/docs"]);
  });
});

describe("gatherTechResearchGrounding retry and cost recording", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveModelTierImpl.mockResolvedValue("standard");
    recordLlmCallEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns real grounding text when a transient failure succeeds on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chatResponseWith(["https://example.com/docs"]),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gatherTechResearchGrounding("SomeTech");

    expect(result.text).toBe("grounding text");
    expect(result.citations).toEqual(["https://example.com/docs"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes token usage through to the recorded llm call event", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        chatResponseWith(["https://example.com/docs"], {
          prompt_tokens: 120,
          completion_tokens: 45,
          total_tokens: 165,
        }),
    }) as unknown as typeof fetch;

    await gatherTechResearchGrounding("SomeTech");

    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 120,
        completionTokens: 45,
        totalTokens: 165,
      }),
    );
  });

  it("falls back to empty grounding without throwing when every attempt fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;

    const result = await gatherTechResearchGrounding("SomeTech");

    expect(result).toEqual({ text: "", citations: [] });
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("falls back to empty grounding when restModel rejects without throwing", async () => {
    resolveEffectiveModelTierImpl.mockRejectedValue(new Error("tier resolution failed"));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chatResponseWith(["https://example.com/docs"]),
    }) as unknown as typeof fetch;

    const result = await gatherTechResearchGrounding("SomeTech");

    expect(result).toEqual({ text: "", citations: [] });
  });

  it("calls restModel exactly once per gatherGrounding call, even when retries happen", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chatResponseWith(["https://example.com/docs"]),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await gatherTechResearchGrounding("SomeTech");

    expect(resolveEffectiveModelTierImpl).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("resolveOfficialDocsUrl retry and cost recording", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveModelTierImpl.mockResolvedValue("standard");
    recordLlmCallEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the resolved docs URL when a transient failure succeeds on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chatResponseWith(["https://docs.example.com"]),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveOfficialDocsUrl("SomeTech");

    expect(result).toBe("https://docs.example.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes token usage through to the recorded llm call event", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        chatResponseWith(["https://docs.example.com"], {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
        }),
    }) as unknown as typeof fetch;

    await resolveOfficialDocsUrl("SomeTech");

    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 50,
        completionTokens: 10,
        totalTokens: 60,
      }),
    );
  });

  it("falls back to null without throwing when every attempt fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;

    const result = await resolveOfficialDocsUrl("SomeTech");

    expect(result).toBeNull();
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("exhausts after a single attempt on a non-retryable 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveOfficialDocsUrl("SomeTech");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("gatherTrustedSourceCandidates retry and cost recording", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveModelTierImpl.mockResolvedValue("standard");
    recordLlmCallEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns trusted source candidates when a transient failure succeeds on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chatResponseWith(["https://blog.example.com/post"]),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gatherTrustedSourceCandidates("SomeTech");

    expect(result).toEqual([
      {
        url: "https://blog.example.com/post",
        title: "Trusted source (blog/paper): https://blog.example.com/post",
        discoveryTier: "trusted_search",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes token usage through to the recorded llm call event", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        chatResponseWith(["https://blog.example.com/post"], {
          prompt_tokens: 80,
          completion_tokens: 20,
          total_tokens: 100,
        }),
    }) as unknown as typeof fetch;

    await gatherTrustedSourceCandidates("SomeTech");

    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 80,
        completionTokens: 20,
        totalTokens: 100,
      }),
    );
  });

  it("falls back to an empty array without throwing when every attempt fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;

    const result = await gatherTrustedSourceCandidates("SomeTech");

    expect(result).toEqual([]);
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("exhausts after a single attempt on a non-retryable 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gatherTrustedSourceCandidates("SomeTech");

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
