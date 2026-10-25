import { describe, expect, it } from "vitest";
import {
  FLAGGED_MAX_PER_CHUNK,
  selectFlaggedLessons,
  type FlaggedLesson,
} from "./knowledge-bit-flagged-lesson.js";
import { validateSourceItems, type LessonDraft } from "./knowledge-bit-source-item-validation.js";
import { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT } from "./knowledge-bit-source-items.test-mocks.js";

const GOOD = RU_EXAMPLE_ITEMS[0]!;

function withCard(overrides: Partial<LessonDraft["cards"][number]>): LessonDraft {
  return { ...GOOD, cards: [{ ...GOOD.cards[0]!, ...overrides }] };
}

describe("validateSourceItems rejected cards", () => {
  it("should keep a card whose quote is not in the source as a rejected lesson with its reason", () => {
    const result = validateSourceItems([{ ...GOOD, quote: "цитата которой нет в источнике вообще" }], RU_SOURCE_TEXT);

    expect(result.valid).toEqual([]);
    expect(result.rejected.map((entry) => entry.reason)).toEqual(["quote_not_in_source"]);
    expect(result.rejected[0]?.lesson.cards).toHaveLength(1);
  });

  it("should keep only the rejected card of a mixed lesson as flagged and the clean one as valid", () => {
    const lesson: LessonDraft = {
      ...GOOD,
      cards: [GOOD.cards[0]!, { ...GOOD.cards[0]!, question: "Это правда?", answer: "Да" }],
    };

    const result = validateSourceItems([lesson], RU_SOURCE_TEXT);

    expect(result.valid[0]?.cards).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("bad_card");
  });

  it("should never keep a card with injected links", () => {
    const result = validateSourceItems(
      [withCard({ answer: "Смотрите https://evil.example/pay сейчас" })],
      RU_SOURCE_TEXT,
    );

    expect(result.rejected).toEqual([]);
  });

  it("should never keep a card with an empty answer", () => {
    const result = validateSourceItems([withCard({ answer: "   " })], RU_SOURCE_TEXT);

    expect(result.rejected).toEqual([]);
  });

  it("should keep strict rules so a rejected card is still dropped from the clean list", () => {
    const result = validateSourceItems([withCard({ question: "Это правда?", answer: "Да" })], RU_SOURCE_TEXT);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toContain("bad_card");
  });
});

describe("selectFlaggedLessons", () => {
  function flaggedLesson(tag: string): FlaggedLesson {
    return { reason: "bad_card", lesson: { ...GOOD, statement: `Утверждение ${tag}` } };
  }

  it("should keep at most three flagged lessons per chunk", () => {
    const taken = selectFlaggedLessons(
      ["a", "b", "c", "d", "e"].map(flaggedLesson),
      new Set(),
    );

    expect(taken).toHaveLength(FLAGGED_MAX_PER_CHUNK);
  });

  it("should skip a flagged lesson repeating a statement the note already holds", () => {
    const taken = selectFlaggedLessons([flaggedLesson("a"), flaggedLesson("b")], new Set(["утверждение a"]));

    expect(taken.map((entry) => entry.lesson.statement)).toEqual(["Утверждение b"]);
  });
});
