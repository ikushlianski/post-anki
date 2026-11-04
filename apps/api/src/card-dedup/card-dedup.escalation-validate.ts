import type { CardDedupOutput, DedupPrompt } from "../mastra/card-dedup-escalation.agent.js";
import { CARD_DEDUP_REASON_CHARS } from "./card-dedup.config.js";

export interface DedupVerdict {
  same: boolean;
  reason: string | null;
}

export function validateDedupEscalation(output: CardDedupOutput, prompt: DedupPrompt): Map<string, DedupVerdict> {
  const byBit = new Map<string, DedupVerdict>();

  for (const entry of output.pairs) {
    const bitId = prompt.pairs.get(entry.pair);

    if (bitId === undefined || byBit.has(bitId)) {
      continue;
    }

    const reason = entry.reason.trim().slice(0, CARD_DEDUP_REASON_CHARS);

    byBit.set(bitId, { same: entry.same, reason: reason === "" ? null : reason });
  }

  return byBit;
}
