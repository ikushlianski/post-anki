import { describe, expect, it } from "vitest";
import {
  isQuoteInSource,
  selectNewItems,
  normalizeForQuoteMatch,
  validateSourceItem,
  validateSourceItems,
  type SourceItemDraft,
} from "./knowledge-bit-source-item-validation.js";

const RU_SOURCE =
  "Когда мы продаем компании софт, нам не обязательно искать боли клиента, как часто учат маркетологи.\n\nСамое главное, что руководство фирмы наконец-то осознает потребность в покупке софта, потому что оно само не удовлетворено текущими административными рутинами. То есть это не боль клиента, а просто иное видение клиентом своего будущего. Метафора «клиентская боль» на самом деле не существует в мире корпораций.";

const EN_SOURCE =
  "Ribosomes synthesize proteins in the cell. Without working ribosomes, a cell cannot build new proteins and soon dies.";

function item(overrides: Partial<SourceItemDraft>): SourceItemDraft {
  return {
    kind: "why",
    statement: "Покупку софта запускает иное видение клиентом своего будущего",
    question: "Почему руководство компании решает купить софт?",
    answer: "Оно само не удовлетворено текущими административными рутинами",
    quote: "руководство фирмы наконец-то осознает потребность в покупке софта",
    ...overrides,
  };
}

describe("normalizeForQuoteMatch", () => {
  it("should ignore case, ё, quote marks and whitespace differences", () => {
    expect(normalizeForQuoteMatch("  Ёлка   «Клиентская\n боль» ")).toBe("елка клиентская боль");
  });
});

describe("isQuoteInSource", () => {
  it("should accept a quote that differs from the source only by case, whitespace and quote marks", () => {
    expect(isQuoteInSource("МЕТАФОРА клиентская   БОЛЬ на самом деле", RU_SOURCE)).toBe(true);
  });

  it("should accept a quote that spans a line break in the source", () => {
    expect(isQuoteInSource("как часто учат маркетологи. самое главное", RU_SOURCE)).toBe(true);
  });

  it("should reject a fabricated quote", () => {
    expect(isQuoteInSource("клиенты всегда хотят скидку на софт", RU_SOURCE)).toBe(false);
  });
});

describe("validateSourceItem", () => {
  it("should accept a well-formed why item with a verbatim quote", () => {
    expect(validateSourceItem(item({}), RU_SOURCE).ok).toBe(true);
  });

  it("should reject an item whose quote is fabricated", () => {
    expect(validateSourceItem(item({ quote: "клиентам нужна скидка на софт всегда" }), RU_SOURCE)).toEqual({
      ok: false,
      reason: "quote_not_in_source",
    });
  });

  it("should reject a quote that is too short to prove anything", () => {
    expect(validateSourceItem(item({ quote: "софта" }), RU_SOURCE)).toEqual({
      ok: false,
      reason: "quote_length",
    });
  });

  it("should reject a Russian item written from an English source (translation)", () => {
    expect(
      validateSourceItem(
        item({
          statement: "Покупку софта запускает иное видение будущего",
          question: "Why do ribosomes matter?",
          answer: "Ответ на русском языке про рибосомы",
          quote: "Ribosomes synthesize proteins",
        }),
        EN_SOURCE,
      ),
    ).toEqual({ ok: false, reason: "wrong_language" });
  });

  it("should reject an English question that mentions the text", () => {
    expect(
      validateSourceItem(
        item({
          statement: "Ribosomes synthesize proteins in the cell",
          question: "What does the text say ribosomes do?",
          answer: "They synthesize proteins",
          quote: "Ribosomes synthesize proteins in the cell",
        }),
        EN_SOURCE,
      ),
    ).toEqual({ ok: false, reason: "source_meta_reference" });
  });

  it("should reject a Russian question that mentions the author or the text", () => {
    expect(
      validateSourceItem(item({ question: "Почему, по мнению автора, компания покупает софт?" }), RU_SOURCE),
    ).toEqual({ ok: false, reason: "source_meta_reference" });
    expect(
      validateSourceItem(item({ question: "Что сказано в тексте о покупке софта?" }), RU_SOURCE),
    ).toEqual({ ok: false, reason: "source_meta_reference" });
  });

  it("should reject a card whose question already contains the answer", () => {
    expect(
      validateSourceItem(
        item({
          kind: "basic",
          question: "Верно ли, что оно само не удовлетворено текущими административными рутинами?",
          answer: "оно само не удовлетворено текущими административными рутинами",
        }),
        RU_SOURCE,
      ),
    ).toEqual({ ok: false, reason: "bad_card" });
  });

  it("should accept a fill_blank item with exactly one blank on the key word", () => {
    expect(
      validateSourceItem(
        item({
          kind: "fill_blank",
          statement: "Метафора «клиентская боль» на самом деле не существует в мире корпораций.",
          question: "Метафора «клиентская боль» на самом деле не существует в мире ____.",
          answer: "корпораций",
          quote: "на самом деле не существует в мире корпораций",
        }),
        RU_SOURCE,
      ).ok,
    ).toBe(true);
  });

  it("should reject a fill_blank item with two blanks", () => {
    expect(
      validateSourceItem(
        item({
          kind: "fill_blank",
          statement: "Метафора «клиентская боль» на самом деле не существует в мире корпораций.",
          question: "Метафора «клиентская ____» на самом деле не существует в мире ____.",
          answer: "корпораций",
          quote: "на самом деле не существует в мире корпораций",
        }),
        RU_SOURCE,
      ),
    ).toEqual({ ok: false, reason: "bad_blank" });
  });

  it("should reject a fill_blank item whose question is a reworded question instead of the statement with a blank", () => {
    expect(
      validateSourceItem(
        item({
          kind: "fill_blank",
          statement: "Метафора «клиентская боль» на самом деле не существует в мире корпораций.",
          question: "Существует ли метафора ____ в мире корпораций?",
          answer: "клиентская боль",
          quote: "на самом деле не существует в мире корпораций",
        }),
        RU_SOURCE,
      ),
    ).toEqual({ ok: false, reason: "bad_blank" });
  });

  it("should reject a fill_blank item whose answer is not part of its statement", () => {
    expect(
      validateSourceItem(
        item({
          kind: "fill_blank",
          statement: "Метафора «клиентская боль» на самом деле не существует в мире корпораций.",
          question: "Метафора «клиентская боль» на самом деле не существует в мире ____.",
          answer: "людей",
          quote: "на самом деле не существует в мире корпораций",
        }),
        RU_SOURCE,
      ),
    ).toEqual({ ok: false, reason: "answer_not_in_statement" });
  });

  it("should reject an item with an empty field", () => {
    expect(validateSourceItem(item({ answer: "  " }), RU_SOURCE)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("validateSourceItems", () => {
  it("should keep the valid items and report why the others were dropped", () => {
    const result = validateSourceItems(
      [item({}), item({ quote: "совершенно выдуманная цитата из ниоткуда" })],
      RU_SOURCE,
    );

    expect(result.valid).toHaveLength(1);
    expect(result.dropped).toEqual(["quote_not_in_source"]);
  });
});

describe("selectNewItems", () => {
  const first = item({ statement: "Claim one" });
  const second = item({ statement: "Claim two" });

  it("should skip statements already seen, ignoring case and spacing, and remember the new ones", () => {
    const seen = new Set(["claim one"]);

    expect(selectNewItems([item({ statement: "CLAIM  one" }), second], seen, 8)).toEqual([second]);
    expect(seen.has("claim two")).toBe(true);
  });

  it("should stop at the limit", () => {
    expect(selectNewItems([first, second], new Set(), 1)).toEqual([first]);
  });

  it("should drop a statement repeated inside the same batch", () => {
    expect(selectNewItems([first, { ...first }], new Set(), 8)).toEqual([first]);
  });
});
