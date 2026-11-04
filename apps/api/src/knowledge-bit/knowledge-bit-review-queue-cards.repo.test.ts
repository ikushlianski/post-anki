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

  it("should carry the note text on cloze and list cards and drop it elsewhere", () => {
    const note = "Rome was {{c1::founded}} in 753 BC.";

    expect(toCard({ ...baseRow, kind: "cloze", sentence: note, sourceLinks: null }, new Date()).sentence).toBe(note);
    expect(toCard({ ...baseRow, kind: "list_step", sentence: "T\na", sourceLinks: null }, new Date()).sentence).toBe("T\na");
    expect(toCard({ ...baseRow, kind: "fill_in_the_blank", sentence: "x", sourceLinks: null }, new Date()).sentence).toBeUndefined();
    expect(toCard({ ...baseRow, kind: "cloze", sentence: null, sourceLinks: null }, new Date()).sentence).toBeUndefined();
  });

  it("should carry the card's context so the review screen can show it above the front", () => {
    expect(toCard({ ...baseRow, sourceLinks: null, context: "To a manager" }, new Date()).context).toBe("To a manager");
  });
});

describe("toCard rolling phrase front", () => {
  const phraseRow = {
    ...baseRow,
    prompt: "Let's ____ on this.\nНачать двигаться",
    answer: "get the ball rolling",
    body: "get the ball rolling",
    sourceLinks: null,
    isNew: false,
  };

  it("should reveal more of the phrase on a card that has been reviewed fewer times", () => {
    expect(toCard({ ...phraseRow, reviewCount: 1 }, new Date()).prompt).toBe(
      "Let's get the ____ ____ on this.\nНачать двигаться",
    );
  });

  it("should show a brand new phrase card with all but the last word visible", () => {
    expect(toCard({ ...phraseRow, isNew: true, reviewCount: null }, new Date()).prompt).toContain(
      "get the ball ____",
    );
  });

  it("should not alter the front of an ordinary card", () => {
    expect(toCard({ ...baseRow, prompt: "Q?", body: "something", sourceLinks: null }, new Date()).prompt).toBe("Q?");
  });
});

describe("toCard original phrase", () => {
  const row = { ...baseRow, answer: "wrap things up", body: "wrap it up", sourceLinks: null };

  it("should expose the phrase the user wrote when an AI-preferred version replaced it", () => {
    expect(toCard({ ...row, aiSuggestion: "wrap things up" }, new Date()).originalPhrase).toBe("wrap it up");
  });

  it("should leave the original phrase off cards without an AI suggestion", () => {
    expect(toCard({ ...row, aiSuggestion: null }, new Date()).originalPhrase).toBeUndefined();
  });
});
