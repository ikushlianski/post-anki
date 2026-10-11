import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_ITEM_MODEL_IDS,
  KNOWLEDGE_ITEM_MODELS,
  KNOWLEDGE_ITEM_MODELS_CHECKED_ON,
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  knowledgeItemModelIdSchema,
} from "./knowledge-item-model.js";

const EXPIRY_WINDOW_DAYS = 60;

function daysAfterCheck(days: number): Date {
  const checked = new Date(`${KNOWLEDGE_ITEM_MODELS_CHECKED_ON}T00:00:00Z`);

  return new Date(checked.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("knowledgeItemModelIdSchema", () => {
  it("should accept each of the five candidate model ids", () => {
    expect(KNOWLEDGE_ITEM_MODEL_IDS).toHaveLength(5);

    for (const id of KNOWLEDGE_ITEM_MODEL_IDS) {
      expect(knowledgeItemModelIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("should reject a model id outside the allowlist", () => {
    expect(knowledgeItemModelIdSchema.safeParse("openrouter/deepseek/deepseek-v4-pro").success).toBe(false);
  });

  it("should reject the removed deepseek flash id that older settings rows may still store", () => {
    expect(knowledgeItemModelIdSchema.safeParse("openrouter/deepseek/deepseek-v4-flash").success).toBe(false);
  });

  it("should reject the removed GPT-4o mini id that older settings rows may still store", () => {
    expect(knowledgeItemModelIdSchema.safeParse("openrouter/openai/gpt-4o-mini").success).toBe(false);
  });

  it("should reject the removed GPT-4.1 nano id that older settings rows may still store", () => {
    expect(knowledgeItemModelIdSchema.safeParse("openrouter/openai/gpt-4.1-nano").success).toBe(false);
  });

  it("should reject the -latest alias of an allowed model", () => {
    expect(knowledgeItemModelIdSchema.safeParse("openrouter/deepseek/deepseek-v4-flash-latest").success).toBe(false);
  });

  it("should reject an empty string", () => {
    expect(knowledgeItemModelIdSchema.safeParse("").success).toBe(false);
  });
});

describe("KNOWLEDGE_ITEM_MODELS", () => {
  it("should give every candidate positive prices and a note", () => {
    for (const id of KNOWLEDGE_ITEM_MODEL_IDS) {
      const option = KNOWLEDGE_ITEM_MODELS[id];

      expect(option.inputPerMillion).toBeGreaterThan(0);
      expect(option.outputPerMillion).toBeGreaterThan(0);
      expect(option.note.length).toBeGreaterThan(0);
    }
  });

  it("should default to a model that is in the allowlist", () => {
    expect(KNOWLEDGE_ITEM_MODEL_IDS).toContain(DEFAULT_KNOWLEDGE_ITEM_MODEL_ID);
  });

  it("should default to a model that does not expire within 60 days of the price check", () => {
    const { expiresOn } = KNOWLEDGE_ITEM_MODELS[DEFAULT_KNOWLEDGE_ITEM_MODEL_ID];

    expect(expiresOn === null || new Date(`${expiresOn}T00:00:00Z`) > daysAfterCheck(EXPIRY_WINDOW_DAYS)).toBe(true);
  });

  it("should record the expiry date of a listed model that expires within 60 days", () => {
    expect(KNOWLEDGE_ITEM_MODELS["openrouter/google/gemini-2.5-flash-lite"].expiresOn).toBe("2026-10-20");
  });

  it("should record no expiry date for a listed model with none on OpenRouter", () => {
    expect(KNOWLEDGE_ITEM_MODELS["openrouter/anthropic/claude-haiku-5.5"].expiresOn).toBeNull();
  });
});
