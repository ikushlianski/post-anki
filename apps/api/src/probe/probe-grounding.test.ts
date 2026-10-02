import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({ OPENROUTER_API_KEY: "test-key", OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../mastra/mastra.js", () => ({
  startTracingSpan: () => undefined,
}));

vi.mock("../mastra/tier-resolver.js", () => ({
  resolveEffectiveModelTier: async () => "standard",
}));

vi.mock("../mastra/model-tier.js", () => ({
  tierToModelId: () => "openrouter/some-model",
}));

const getCurriculumCitableUrls = vi.fn();
const getCurriculumGroundingText = vi.fn();

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumCitableUrls: (id: string) => getCurriculumCitableUrls(id),
  getCurriculumGroundingText: (id: string) => getCurriculumGroundingText(id),
}));

const recordLlmCallEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: (...args: unknown[]) => recordLlmCallEvent(...args),
}));

const { webSearch, gatherProbeGrounding } = await import("./probe-grounding.js");

function chatResponseWith(urls: (string | undefined)[]): unknown {
  return {
    choices: [
      {
        message: {
          content: "grounding text",
          annotations: urls.map((url) => ({ url_citation: { url } })),
        },
      },
    ],
  };
}

describe("webSearch citation safety", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("drops unsafe citation URLs a learner should never be handed as a clickable link", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        chatResponseWith([
          "https://example.com/real-source",
          "javascript:alert(1)",
          "http://169.254.169.254/latest/meta-data",
        ]),
    }) as unknown as typeof fetch;

    const outcome = await webSearch("prompt", "test.span");

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.citations).toEqual(["https://example.com/real-source"]);
    }
  });

  it("keeps a normal https citation intact", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chatResponseWith(["https://example.com/docs"]),
    }) as unknown as typeof fetch;

    const outcome = await webSearch("prompt", "test.span");

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.citations).toEqual(["https://example.com/docs"]);
    }
  });
});

describe("webSearch retry and cost recording", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
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

    const outcome = await webSearch("prompt", "test.span");

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.text).toBe("grounding text");
      expect(outcome.citations).toEqual(["https://example.com/docs"]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes token usage through to the recorded llm call event", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "grounding text",
              annotations: [{ url_citation: { url: "https://example.com/docs" } }],
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
      }),
    }) as unknown as typeof fetch;

    await webSearch("prompt", "test.span");

    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 120,
        completionTokens: 45,
        totalTokens: 165,
      }),
    );
  });

  it("returns ok:false with error (not status) when every attempt is a network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;

    const outcome = await webSearch("prompt", "test.span");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBeUndefined();
      expect(outcome.error).toBeDefined();
    }
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("returns ok:false with the status when a non-retryable 4xx exhausts immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await webSearch("prompt", "test.span");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(401);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false with the status when a retryable 5xx exhausts after retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await webSearch("prompt", "test.span");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(503);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("gatherProbeGrounding pasted-source citations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops an unsafe curriculum-stored citation before it reaches the learner", async () => {
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue([
      "https://example.com/trusted",
      "javascript:alert(1)",
    ]);

    const result = await gatherProbeGrounding("curriculum-1", "Topic", "Focus");

    expect(result.citations).toEqual(["https://example.com/trusted"]);
  });
});
