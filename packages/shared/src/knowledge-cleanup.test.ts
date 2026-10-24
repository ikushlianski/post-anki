import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_PURGE_MAX_IDS,
  clearAllKnowledgeInput,
  purgeKnowledgeBitsInput,
} from "./knowledge-cleanup";

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `kb_${i}`);

describe("purgeKnowledgeBitsInput", () => {
  it("should accept a full 500-piece selection in one request", () => {
    expect(purgeKnowledgeBitsInput.safeParse({ ids: ids(KNOWLEDGE_PURGE_MAX_IDS) }).success).toBe(true);
  });

  it("should reject an empty selection and one over the cap", () => {
    expect(purgeKnowledgeBitsInput.safeParse({ ids: [] }).success).toBe(false);
    expect(purgeKnowledgeBitsInput.safeParse({ ids: ids(KNOWLEDGE_PURGE_MAX_IDS + 1) }).success).toBe(false);
  });
});

describe("clearAllKnowledgeInput", () => {
  it("should only accept the exact confirmation phrase so a stray request cannot wipe everything", () => {
    expect(clearAllKnowledgeInput.safeParse({ confirm: "DELETE ALL KNOWLEDGE" }).success).toBe(true);
    expect(clearAllKnowledgeInput.safeParse({ confirm: "delete all knowledge" }).success).toBe(false);
    expect(clearAllKnowledgeInput.safeParse({}).success).toBe(false);
  });
});
