import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_ITEM_MODEL_IDS,
  KNOWLEDGE_ITEM_MODELS,
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  knowledgeItemModelIdSchema,
} from "./knowledge-item-model.js";

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
});
