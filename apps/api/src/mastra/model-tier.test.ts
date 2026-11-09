import { describe, expect, it } from "vitest";
import { CHAT_QUEUE_LIGHT_MODEL_ID, CHAT_QUEUE_MODEL_ID, resolveModelTier, tierToModelId } from "./model-tier.js";

describe("tierToModelId", () => {
  it("maps the cheap tier to the cheapest live DeepSeek OpenRouter model", () => {
    expect(tierToModelId("cheap")).toBe("openrouter/deepseek/deepseek-v4-flash");
  });

  it("maps the balanced tier to the existing default, unchanged for anyone who opts up", () => {
    expect(tierToModelId("balanced")).toBe("openrouter/openai/gpt-4o-mini");
  });

  it("maps the premium tier to the stronger DeepSeek model on the same provider", () => {
    expect(tierToModelId("premium")).toBe("openrouter/deepseek/deepseek-v4-pro");
  });
});

describe("CHAT_QUEUE_MODEL_ID", () => {
  it("should answer learner chats with the premium tier model so card fixes get stronger reasoning", () => {
    expect(CHAT_QUEUE_MODEL_ID).toBe(tierToModelId("premium"));
  });

  it("should keep the Gemini Flash model as the light option for unattended replies", () => {
    expect(CHAT_QUEUE_LIGHT_MODEL_ID).toBe("openrouter/google/gemini-3-flash-preview");
    expect(CHAT_QUEUE_LIGHT_MODEL_ID).not.toBe(CHAT_QUEUE_MODEL_ID);
  });
});

describe("resolveModelTier", () => {
  it("falls through to the global default when neither curriculum nor subject set a tier", () => {
    const tier = resolveModelTier({
      curriculumModelTier: null,
      subjectModelTier: null,
      globalModelTier: "cheap",
    });

    expect(tier).toBe("cheap");
  });

  it("lets a subject override beat the global default when the curriculum has none", () => {
    const tier = resolveModelTier({
      curriculumModelTier: null,
      subjectModelTier: "balanced",
      globalModelTier: "cheap",
    });

    expect(tier).toBe("balanced");
  });

  it("lets a curriculum override beat both its subject and the global default", () => {
    const tier = resolveModelTier({
      curriculumModelTier: "premium",
      subjectModelTier: "balanced",
      globalModelTier: "cheap",
    });

    expect(tier).toBe("premium");
  });

  it("falls back to the subject's tier once a curriculum override is cleared, not the global default", () => {
    const tier = resolveModelTier({
      curriculumModelTier: null,
      subjectModelTier: "balanced",
      globalModelTier: "cheap",
    });

    expect(tier).toBe("balanced");
  });
});
