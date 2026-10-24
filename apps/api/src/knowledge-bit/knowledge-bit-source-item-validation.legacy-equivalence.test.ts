import { describe, expect, it } from "vitest";
import {
  validateSourceItem,
  validateSourceItems,
  type LessonDraft,
  type SourceItemDraft,
} from "./knowledge-bit-source-item-validation.js";

const SOURCE =
  "Руководство фирмы наконец-то осознает потребность в покупке софта, потому что оно само не удовлетворено текущими административными рутинами. Метафора «клиентская боль» на самом деле не существует в мире корпораций.";

const GOOD: SourceItemDraft = {
  kind: "why",
  statement: "Руководство компании решает купить софт, потому что само не удовлетворено текущими административными рутинами.",
  question: "Почему руководство компании решает купить софт?",
  answer: "Оно само не удовлетворено текущими административными рутинами",
  quote: "руководство фирмы наконец-то осознает потребность в покупке софта",
};

const FILL: SourceItemDraft = {
  kind: "fill_blank",
  statement: "Метафора «клиентская боль» на самом деле не существует в мире корпораций.",
  question: "Метафора «клиентская боль» на самом деле не существует в мире ____.",
  answer: "корпораций",
  quote: "на самом деле не существует в мире корпораций",
};

const CASES: Record<string, SourceItemDraft> = {
  "a well-formed why item": GOOD,
  "a fill_blank item with one blank": FILL,
  "a fill_blank item repaired from a missing blank": { ...FILL, question: "Где не существует метафора «клиентская боль»?" },
  "a fill_blank item downgraded to basic": { ...FILL, question: "В каком мире не существует метафора?", answer: "в корпорациях" },
  "a fabricated quote": { ...GOOD, quote: "клиентам нужна скидка на софт всегда" },
  "a yes/no question": { ...GOOD, kind: "basic", question: "Это верно?", answer: "Да" },
  "an injected link": { ...GOOD, answer: "Смотрите https://evil.example/login" },
  "a foreign-language item": { ...GOOD, statement: "Management decides to buy software because of routine." },
  "an empty answer": { ...GOOD, answer: "  " },
};

function wrap(card: SourceItemDraft): LessonDraft {
  return { statement: card.statement, quote: card.quote, example: null, cards: [card] };
}

describe("sentence-level items wrapped as single-card lessons", () => {
  it.each(Object.entries(CASES))("should accept or reject %s exactly as the per-item check does", (_name, card) => {
    const direct = validateSourceItem(card, SOURCE);
    const batch = validateSourceItems([wrap(card)], SOURCE);

    if (direct.ok) {
      expect(batch.dropped).toEqual([]);
      expect(batch.valid).toHaveLength(1);
      expect(batch.valid[0]?.cards).toEqual([direct.item]);
    } else {
      expect(batch.valid).toEqual([]);
      expect(batch.dropped).toEqual([direct.reason]);
    }
  });
});
