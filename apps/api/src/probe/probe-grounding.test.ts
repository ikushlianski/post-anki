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
