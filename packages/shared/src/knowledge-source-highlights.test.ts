import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_HIGHLIGHTS_MAX,
  highlightsFitText,
  knowledgeHighlightsSchema,
  mergeHighlights,
  shiftHighlights,
} from "./knowledge-source-highlights";

describe("knowledge source highlights", () => {
  it("should merge overlapping and adjacent marks into one sorted list", () => {
    expect(
      mergeHighlights([
        { start: 20, end: 30 },
        { start: 0, end: 5 },
        { start: 4, end: 10 },
        { start: 10, end: 12 },
      ]),
    ).toEqual([
      { start: 0, end: 12 },
      { start: 20, end: 30 },
    ]);
  });

  it("should keep a mark that is fully inside another one absorbed", () => {
    expect(mergeHighlights([{ start: 0, end: 50 }, { start: 10, end: 20 }])).toEqual([{ start: 0, end: 50 }]);
  });

  it("should return an empty list for missing input", () => {
    expect(mergeHighlights(undefined)).toEqual([]);
  });

  it("should reject empty, negative and fractional ranges", () => {
    expect(knowledgeHighlightsSchema.safeParse([{ start: 5, end: 5 }]).success).toBe(false);
    expect(knowledgeHighlightsSchema.safeParse([{ start: -1, end: 5 }]).success).toBe(false);
    expect(knowledgeHighlightsSchema.safeParse([{ start: 0.5, end: 5 }]).success).toBe(false);
    expect(knowledgeHighlightsSchema.safeParse([{ start: 0, end: 5 }]).success).toBe(true);
  });

  it("should cap the number of marks", () => {
    const many = Array.from({ length: KNOWLEDGE_HIGHLIGHTS_MAX + 1 }, (_, i) => ({ start: i * 2, end: i * 2 + 1 }));

    expect(knowledgeHighlightsSchema.safeParse(many).success).toBe(false);
    expect(knowledgeHighlightsSchema.safeParse(many.slice(0, KNOWLEDGE_HIGHLIGHTS_MAX)).success).toBe(true);
  });

  it("should detect marks that run past the text", () => {
    expect(highlightsFitText([{ start: 0, end: 10 }], 10)).toBe(true);
    expect(highlightsFitText([{ start: 0, end: 11 }], 10)).toBe(false);
  });

  it("should shift marks by the title prefix length", () => {
    expect(shiftHighlights([{ start: 1, end: 4 }], 6)).toEqual([{ start: 7, end: 10 }]);
  });
});
