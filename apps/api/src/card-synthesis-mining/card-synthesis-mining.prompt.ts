import { sanitizeUntrustedLine } from "../shared/untrusted-prompt-text.js";
import type { AliasedCards, EvidenceCard } from "./card-synthesis-mining.types.js";

export const MINING_MAX_EVIDENCE_CARDS = 12;
export const MINING_CARD_CHARS = 400;
const QUESTION_SHARE = 160;
const TITLE_CHARS = 140;

export function evidenceAlias(index: number): string {
  return `K${index + 1}`;
}

export function buildAliasedCards(cards: EvidenceCard[]): AliasedCards {
  const aliases = new Map<string, EvidenceCard>();
  const blocks = cards.slice(0, MINING_MAX_EVIDENCE_CARDS).map((card, index) => {
    const alias = evidenceAlias(index);
    const question = sanitizeUntrustedLine(card.question, QUESTION_SHARE);
    const answer = sanitizeUntrustedLine(card.answer, MINING_CARD_CHARS - question.length);

    aliases.set(alias, card);

    return `${alias}:\n<card>\nQ: ${question}\nA: ${answer}\n</card>`;
  });

  return { aliases, prompt: `<cards>\n${blocks.join("\n\n")}\n</cards>` };
}

export function buildClassifierPrompt(cards: EvidenceCard[]): AliasedCards {
  return buildAliasedCards(cards);
}

export function buildWriterPrompt(cards: EvidenceCard[], title: string): AliasedCards {
  const aliased = buildAliasedCards(cards);

  return {
    aliases: aliased.aliases,
    prompt: `<topic>${sanitizeUntrustedLine(title, TITLE_CHARS)}</topic>\n\n${aliased.prompt}`,
  };
}
