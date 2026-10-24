import { readFileSync } from "node:fs";
import type { LessonDraft, SourceItemDraft } from "./knowledge-bit-source-item-validation.js";

export const RU_SOURCE_TEXT = readFileSync(
  new URL("./knowledge-bit-source-items.fixture.ru.txt", import.meta.url),
  "utf8",
);

const RU_EXAMPLE_CARDS: SourceItemDraft[] = [
  {
    kind: "why",
    statement:
      "При продаже софта крупной компании не обязательно искать боль клиента, потому что продажа строится на показе компании нового видения её будущего.",
    question: "Почему при продаже софта крупной компании не обязательно искать «боль клиента»?",
    answer: "Потому что продажа строится на показе компании нового видения её будущего",
    quote: "нам не обязательно искать боли клиента",
  },
  {
    kind: "why",
    statement:
      "Руководство компании решает купить софт, потому что само не удовлетворено текущими административными рутинами.",
    question: "Почему руководство компании решает купить софт?",
    answer: "Оно само не удовлетворено текущими административными рутинами",
    quote: "руководство фирмы наконец-то осознает потребность в покупке софта",
  },
  {
    kind: "basic",
    statement: "Покупку софта запускает не боль клиента, а иное видение клиентом своего будущего.",
    question: "Что запускает покупку софта компанией-клиентом?",
    answer: "Иное видение клиентом своего будущего, а не боль клиента",
    quote: "это не боль клиента, а просто иное видение клиентом своего будущего",
  },
  {
    kind: "fill_blank",
    statement: "Метафора «клиентская боль» на самом деле не существует в мире корпораций.",
    question: "Метафора «клиентская боль» на самом деле не существует в мире ____.",
    answer: "корпораций",
    quote: "на самом деле не существует в мире корпораций",
  },
];

const [WHY_SALES, WHY_BUYER, BASIC_VISION, FILL_PAIN] = RU_EXAMPLE_CARDS as [
  SourceItemDraft,
  SourceItemDraft,
  SourceItemDraft,
  SourceItemDraft,
];

function lessonFrom(card: SourceItemDraft, cards: SourceItemDraft[], example: string | null): LessonDraft {
  return {
    statement: card.statement,
    quote: card.quote,
    example,
    cards: cards.map((item) => ({ ...item, quote: card.quote })),
  };
}

export const RU_EXAMPLE_ITEMS: LessonDraft[] = [
  lessonFrom(WHY_SALES, [WHY_SALES], null),
  lessonFrom(WHY_BUYER, [WHY_BUYER], "Директор покупает софт, когда сам устал от бумажной рутины."),
  lessonFrom(BASIC_VISION, [BASIC_VISION, FILL_PAIN], null),
];

export function itemsForChunk(prefix: string, count: number): LessonDraft[] {
  return Array.from({ length: count }, (_, i) => ({
    statement: `${prefix} claim number ${i} about widgets`,
    quote: `${prefix} marker sentence ${i}`,
    example: null,
    cards: [
      {
        kind: "basic" as const,
        statement: `${prefix} claim number ${i} about widgets`,
        question: `What is claim ${i} of ${prefix}?`,
        answer: `Widgets ${prefix} ${i}`,
        quote: `${prefix} marker sentence ${i}`,
      },
    ],
  }));
}
