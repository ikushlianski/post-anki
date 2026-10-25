import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BIT_VARIANT_KIND_LABELS, knowledgeBitDetailSchema } from "./knowledge-bit-detail";

const base = {
  knowledgeBitId: "kb_1",
  body: "Indexes speed up reads",
  context: null,
  phrasings: [
    {
      id: "v1",
      kind: "basic",
      kindLabel: "Basic",
      prompt: "What do indexes do?",
      answer: "Speed up reads",
      sentence: null,
    },
  ],
  subjectPath: ["Programming", "Databases"],
  tags: [],
  origin: "manual",
  addedBy: "you",
  sourceId: null,
  sourceLabel: null,
  sourceUrl: null,
  addedAt: "2026-01-01T00:00:00.000Z",
  review: { state: "new", dueAt: null, lapses: 0, reviewCount: 0 },
};

describe("knowledgeBitDetailSchema", () => {
  it("should accept a bare piece with no tags, context or source", () => {
    expect(knowledgeBitDetailSchema.safeParse(base).success).toBe(true);
  });

  it("should reject a piece without any phrasing", () => {
    expect(knowledgeBitDetailSchema.safeParse({ ...base, phrasings: [] }).success).toBe(false);
  });

  it("should reject an unknown review state", () => {
    const review = { ...base.review, state: "lost" };

    expect(knowledgeBitDetailSchema.safeParse({ ...base, review }).success).toBe(false);
  });
});

describe("KNOWLEDGE_BIT_VARIANT_KIND_LABELS", () => {
  it("should name every card type the owner can see", () => {
    expect(KNOWLEDGE_BIT_VARIANT_KIND_LABELS).toEqual({
      basic: "Basic",
      wh_question: "Why question",
      fill_in_the_blank: "Fill in the blank",
    });
  });
});
