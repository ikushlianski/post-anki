import { buildClozeCards, parseCloze } from "@post-anki/shared";
import { cardTextKey } from "./knowledge-bit-card-text-key.js";
import { newId } from "../shared/id.js";

export function clozeVariantRows(knowledgeBitId: string, note: string) {
  const parsed = parseCloze(note);

  if (!parsed.ok) {
    return [];
  }

  return buildClozeCards(parsed.note).map((card) => ({
    id: newId("kbqv"),
    knowledgeBitId,
    kind: "cloze" as string,
    order: card.n,
    prompt: card.prompt,
    answer: card.answer,
    sentence: note as string | null,
    cardKey: cardTextKey(card.prompt, card.answer),
  }));
}
