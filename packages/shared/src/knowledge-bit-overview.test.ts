import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_BIT_BULK_MAX_IDS,
  bulkDeleteKnowledgeBitsInput,
  bulkMoveKnowledgeBitsInput,
  knowledgeBitOverviewQuerySchema,
} from "./knowledge-bit-overview";

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `kb_${i}`);

describe("bulkDeleteKnowledgeBitsInput", () => {
  it("should accept up to the bulk cap so one request can clear a full selection", () => {
    expect(bulkDeleteKnowledgeBitsInput.safeParse({ knowledgeBitIds: ids(KNOWLEDGE_BIT_BULK_MAX_IDS) }).success).toBe(true);
  });

  it("should reject an empty selection and one over the cap", () => {
    expect(bulkDeleteKnowledgeBitsInput.safeParse({ knowledgeBitIds: [] }).success).toBe(false);
    expect(bulkDeleteKnowledgeBitsInput.safeParse({ knowledgeBitIds: ids(KNOWLEDGE_BIT_BULK_MAX_IDS + 1) }).success).toBe(false);
  });
});

describe("bulkMoveKnowledgeBitsInput", () => {
  it("should require a target subject so a move never lands nowhere", () => {
    expect(bulkMoveKnowledgeBitsInput.safeParse({ knowledgeBitIds: ["kb_1"] }).success).toBe(false);
    expect(bulkMoveKnowledgeBitsInput.safeParse({ knowledgeBitIds: ["kb_1"], subjectId: "s1" }).success).toBe(true);
  });
});

describe("knowledgeBitOverviewQuerySchema", () => {
  it("should default to the first page of 50 cards when no paging is given", () => {
    expect(knowledgeBitOverviewQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it("should reject a page size above the cap", () => {
    expect(knowledgeBitOverviewQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});
