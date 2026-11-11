import { buildOrderedListCards, parseOrderedListText } from "@post-anki/shared";
import { newId } from "../shared/id.js";
import { cardTextKey } from "./knowledge-bit-card-text-key.js";
import { clozeVariantRows } from "./knowledge-bit-cloze-rows.js";
import type { SourceItemDraft, SourceItemKind } from "./knowledge-bit-source-item-validation.js";

const VARIANT_KIND_BY_ITEM_KIND = {
  why: "wh_question",
  fill_blank: "fill_in_the_blank",
  basic: "basic",
} as const satisfies Record<SourceItemKind, string>;

function orderedListVariantRows(knowledgeBitId: string, listText: string) {
  const parsed = parseOrderedListText(listText);

  if (!parsed.ok) {
    return [];
  }

  return buildOrderedListCards(parsed.list).map((card) => ({
    id: newId("kbqv"),
    knowledgeBitId,
    kind: card.kind as string,
    order: card.order,
    prompt: card.prompt,
    answer: card.answer,
    sentence: listText as string | null,
    cardKey: cardTextKey(card.prompt, card.answer),
  }));
}

export function variantRowsForCard(knowledgeBitId: string, card: SourceItemDraft, order: number) {
  if (card.kind === "cloze") {
    return clozeVariantRows(knowledgeBitId, card.question);
  }

  if (card.kind === "ordered_list") {
    return orderedListVariantRows(knowledgeBitId, card.question);
  }

  return [
    {
      id: newId("kbqv"),
      knowledgeBitId,
      kind: VARIANT_KIND_BY_ITEM_KIND[card.kind] as string,
      order,
      prompt: card.question,
      context: (card.context ?? null) as string | null,
      answer: card.answer,
      sentence: null as string | null,
      cardKey: cardTextKey(card.question, card.answer),
    },
  ];
}
