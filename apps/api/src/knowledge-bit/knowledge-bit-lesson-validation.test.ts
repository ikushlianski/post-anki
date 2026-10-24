import { describe, expect, it } from "vitest";
import {
  validateSourceItems,
  type LessonDraft,
  type SourceItemDraft,
} from "./knowledge-bit-source-item-validation.js";

const SOURCE =
  "Когда я учился в школе, я получал тройки по математике и считал, что деньги нужны только тем, кто много работает. " +
  "Богатый отец говорил, что работники работают ради денег, а предприниматели заставляют деньги работать на себя.";

const QUOTE = "работники работают ради денег, а предприниматели заставляют деньги работать на себя";

function card(overrides: Partial<SourceItemDraft> = {}): SourceItemDraft {
  return {
    kind: "why",
    statement: "Предприниматели заставляют деньги работать на себя, а наемные работники работают ради денег.",
    question: "Чем предприниматель отличается от наемного работника в отношении денег?",
    answer: "Он заставляет деньги работать на себя, а не работает ради денег",
    quote: QUOTE,
    ...overrides,
  };
}

function lesson(overrides: Partial<LessonDraft> = {}): LessonDraft {
  return {
    statement: "Предприниматель выстраивает так, чтобы деньги работали на него, а работник обменивает время на деньги.",
    quote: QUOTE,
    example: "Богатый отец объяснял разницу сыну на примере двух людей.",
    cards: [card()],
    ...overrides,
  };
}

describe("validateSourceItems for lessons", () => {
  it("should keep an abstract lesson whose wording is not in the source when its quote is", () => {
    const result = validateSourceItems([lesson()], SOURCE);

    expect(result.dropped).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.example).toContain("Богатый отец");
  });

  it("should drop a lesson whose supporting quote was invented", () => {
    const result = validateSourceItems([lesson({ quote: "этой фразы в исходном тексте нет совсем" })], SOURCE);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toEqual(["quote_not_in_source"]);
  });

  it("should drop a lesson written in a different language than the source", () => {
    const result = validateSourceItems(
      [lesson({ statement: "Entrepreneurs make money work for them while employees work for money." })],
      SOURCE,
    );

    expect(result.dropped).toEqual(["wrong_language"]);
  });

  it("should drop a lesson that talks about the text itself", () => {
    const result = validateSourceItems([lesson({ statement: "В тексте автор объясняет разницу между людьми." })], SOURCE);

    expect(result.valid).toEqual([]);
  });

  it("should drop a lesson with no valid card and report the card reason", () => {
    const badCard = card({ answer: "  " });
    const result = validateSourceItems([lesson({ cards: [badCard] })], SOURCE);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toEqual(["empty"]);
  });

  it("should keep the good card of a lesson when its other card is rejected", () => {
    const yesNo = card({ question: "Работают ли предприниматели ради денег?", answer: "Нет" });
    const result = validateSourceItems([lesson({ cards: [card(), yesNo] })], SOURCE);

    expect(result.valid[0]!.cards).toHaveLength(1);
    expect(result.dropped).toEqual(["bad_card"]);
  });

  it("should anchor every card to the lesson quote", () => {
    const result = validateSourceItems([lesson({ cards: [card({ quote: "выдуманная цитата карточки" })] })], SOURCE);

    expect(result.valid[0]!.cards[0]!.quote).toBe(QUOTE);
  });

  it("should discard an example that carries a link not present in the source", () => {
    const result = validateSourceItems([lesson({ example: "Смотрите https://evil.example/x" })], SOURCE);

    expect(result.valid[0]!.example).toBeNull();
  });

  it("should discard an over-long example instead of storing it", () => {
    const result = validateSourceItems([lesson({ example: "я".repeat(201) })], SOURCE);

    expect(result.valid[0]!.example).toBeNull();
  });
});
