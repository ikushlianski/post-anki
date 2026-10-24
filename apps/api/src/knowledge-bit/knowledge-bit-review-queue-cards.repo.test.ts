import { describe, expect, it } from "vitest";
import { toCard } from "./knowledge-bit-review-queue-cards.repo.js";

const baseRow = {
  variantId: "v1",
  knowledgeBitId: "kb1",
  kind: "basic",
  prompt: "p",
  answer: "a",
  background: null,
  isAiGenerated: false,
  isNew: true,
  easeFactor: null,
  intervalDays: null,
  phase: null,
  learningStep: null,
  lapses: null,
};

describe("toCard", () => {
  it("should give a human-made card no AI flag and an empty source list when links are stored as null", () => {
    const card = toCard({ ...baseRow, sourceLinks: null }, new Date());

    expect(card.isAiGenerated).toBe(false);
    expect(card.sourceLinks).toEqual([]);
  });

  it("should carry the AI flag and stored source links onto the card", () => {
    const links = ["https://example.com/a"];
    const card = toCard({ ...baseRow, isAiGenerated: true, sourceLinks: links }, new Date());

    expect(card.isAiGenerated).toBe(true);
    expect(card.sourceLinks).toEqual(links);
  });

  it("should expose the subject of the card's source and null when the source has none", () => {
    expect(toCard({ ...baseRow, sourceLinks: null, subjectId: "subj1" }, new Date()).subjectId).toBe("subj1");
    expect(toCard({ ...baseRow, sourceLinks: null }, new Date()).subjectId).toBeNull();
  });
});
