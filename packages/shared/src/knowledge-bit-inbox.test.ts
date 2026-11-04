import { describe, expect, it } from "vitest";
import { knowledgeBitFeedbackVerdictSchema } from "./knowledge-bit-review-feedback";
import { knowledgeBitApprovalStateSchema, pendingKnowledgeBitReviewCountResponse } from "./knowledge-bit";
import {
  EXAMPLE_AI_MAX_GENERATIONS,
  generateKnowledgeBitExampleInput,
  generateKnowledgeBitExampleResultSchema,
  inboxKnowledgeBitListSchema,
} from "./knowledge-bit-inbox";

describe("inbox contracts", () => {
  it("should accept inbox as an approval state and leave the feedback verdicts unchanged", () => {
    expect(knowledgeBitApprovalStateSchema.safeParse("inbox").success).toBe(true);
    expect(knowledgeBitFeedbackVerdictSchema.safeParse("inbox").success).toBe(false);
  });

  it("should parse a pending count response with or without inboxCount", () => {
    expect(pendingKnowledgeBitReviewCountResponse.parse({ count: 2 })).toEqual({
      count: 2,
      attentionCount: 0,
      inboxCount: 0,
    });
    expect(pendingKnowledgeBitReviewCountResponse.parse({ count: 2, inboxCount: 4 }).inboxCount).toBe(4);
  });

  it("should parse an inbox item without subject or example", () => {
    const parsed = inboxKnowledgeBitListSchema.parse({
      items: [
        {
          id: "kb_1",
          body: "B",
          background: null,
          exampleAiGeneratedAt: null,
          origin: "manual",
          subjectName: null,
          cardCount: 0,
          inboxAt: "2026-10-28T10:00:00.000Z",
        },
      ],
      count: 1,
    });

    expect(parsed.items[0]?.subjectName).toBeNull();
    expect(parsed.items[0]?.note).toBeNull();
  });

  it("should carry the editable note of a cloze item and reject an unknown note mode", () => {
    const item = {
      id: "kb_1",
      body: "B",
      background: null,
      exampleAiGeneratedAt: null,
      origin: "manual",
      subjectName: null,
      cardCount: 1,
      inboxAt: "2026-10-28T10:00:00.000Z",
    };
    const note = { variantId: "v1", mode: "cloze", text: "A {{c1::b}}" };

    expect(inboxKnowledgeBitListSchema.parse({ items: [{ ...item, note }], count: 1 }).items[0]?.note).toEqual(note);
    expect(
      inboxKnowledgeBitListSchema.safeParse({ items: [{ ...item, note: { ...note, mode: "basic" } }], count: 1 }).success,
    ).toBe(false);
  });

  it("should default overwrite to false for an empty example request", () => {
    expect(generateKnowledgeBitExampleInput.parse({})).toEqual({ overwrite: false });
  });

  it("should reject an example result over 300 characters or with too many generations left", () => {
    const base = {
      knowledgeBitId: "kb_1",
      example: "ok",
      exampleAiGeneratedAt: "2026-10-28T10:00:00.000Z",
      previousExample: null,
      generationsLeft: EXAMPLE_AI_MAX_GENERATIONS,
    };

    expect(generateKnowledgeBitExampleResultSchema.safeParse(base).success).toBe(true);
    expect(generateKnowledgeBitExampleResultSchema.safeParse({ ...base, example: "x".repeat(301) }).success).toBe(false);
    expect(generateKnowledgeBitExampleResultSchema.safeParse({ ...base, generationsLeft: 6 }).success).toBe(false);
  });
});
