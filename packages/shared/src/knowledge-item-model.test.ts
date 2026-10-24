import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_ITEM_MODEL_IDS,
  KNOWLEDGE_ITEM_MODELS,
  KNOWLEDGE_ITEM_MODELS_CHECKED_ON,
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  knowledgeItemModelIdSchema,
  formatKnowledgeItemModelPrice,
  resolveKnowledgeItemModelId,
} from "./knowledge-item-model.js";

const EXPIRY_WINDOW_DAYS = 60;

function daysAfterCheck(days: number): Date {
  const checked = new Date(`${KNOWLEDGE_ITEM_MODELS_CHECKED_ON}T00:00:00Z`);

  return new Date(checked.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("knowledgeItemModelIdSchema", () => {
  it("should accept each of the ten listed model ids", () => {
    expect(KNOWLEDGE_ITEM_MODEL_IDS).toHaveLength(10);

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

  it("should reject the retired gemini-2.5-flash-lite id that old settings rows may store", () => {
    expect(knowledgeItemModelIdSchema.safeParse("openrouter/google/gemini-2.5-flash-lite").success).toBe(false);
  });

  it("should record no expiry date for a listed model with none on OpenRouter", () => {
    expect(KNOWLEDGE_ITEM_MODELS["openrouter/anthropic/claude-haiku-5.5"].expiresOn).toBeNull();
  });
});

describe("formatKnowledgeItemModelPrice", () => {
  it("should show both prices per million tokens like OpenRouter does", () => {
    expect(formatKnowledgeItemModelPrice({ inputPerMillion: 0.1, outputPerMillion: 0.5 })).toBe(
      "$0.10 in / $0.50 out per 1M",
    );
  });

  it("should keep three decimals for sub-ten-cent prices", () => {
    expect(formatKnowledgeItemModelPrice({ inputPerMillion: 0.037, outputPerMillion: 0.17 })).toBe(
      "$0.037 in / $0.17 out per 1M",
    );
  });

  it("should drop trailing zeros for a nine-cent price", () => {
    expect(formatKnowledgeItemModelPrice({ inputPerMillion: 0.09, outputPerMillion: 2 })).toBe(
      "$0.09 in / $2.00 out per 1M",
    );
  });
});

describe("resolveKnowledgeItemModelId", () => {
  it("should keep a listed model id", () => {
    expect(resolveKnowledgeItemModelId("openrouter/openai/gpt-6-luna")).toBe("openrouter/openai/gpt-6-luna");
  });

  it("should fall back to the default for an unknown id", () => {
    expect(resolveKnowledgeItemModelId("openrouter/deepseek/deepseek-v4-flash")).toBe(
      DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
    );
  });

  it("should fall back to the default when nothing is stored", () => {
    expect(resolveKnowledgeItemModelId(null)).toBe(DEFAULT_KNOWLEDGE_ITEM_MODEL_ID);
    expect(resolveKnowledgeItemModelId(undefined)).toBe(DEFAULT_KNOWLEDGE_ITEM_MODEL_ID);
  });
});
