import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({ OPENROUTER_API_KEY: "test-key", OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../mastra/tier-resolver.js", () => ({
  resolveEffectiveModelTier: async () => "standard",
}));

vi.mock("../mastra/model-tier.js", () => ({
  tierToModelId: () => "openrouter/some-model",
}));

const { gatherTechResearchGrounding } = await import("./tech-research-grounding.js");

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

describe("gatherTechResearchGrounding citation safety", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
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
