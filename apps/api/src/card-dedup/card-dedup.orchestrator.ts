import { log } from "../shared/log.js";
import { embedTexts } from "../shared/embeddings-client.js";
import { searchApprovedBitsByEmbedding } from "../knowledge-bit/knowledge-bit-embedding.repo.js";
import { runCardDedupEscalation, type DedupPair } from "../mastra/card-dedup-escalation.agent.js";
import {
  CARD_DEDUP_BIT_CAP,
  CARD_DEDUP_BORDERLINE_THRESHOLD,
  CARD_DEDUP_CANDIDATES_PER_CARD,
  CARD_DEDUP_NEAR_IDENTICAL_REASON,
  CARD_DEDUP_ESCALATION_CARD_CHARS,
  CARD_DEDUP_ESCALATION_PAIR_CAP,
  isCardDedupEnabled,
} from "./card-dedup.config.js";
import { validateDedupEscalation, type DedupVerdict } from "./card-dedup.escalation-validate.js";
import { listBitsAwaitingDedup, recordDuplicateCheck } from "./card-dedup.repo.js";
import { classifySimilarity, type DuplicateMatch } from "./card-dedup.select.js";

export interface CardDedupScanResult {
  checked: number;
  flagged: number;
  escalated: number;
}

interface Borderline {
  pair: DedupPair;
  match: DuplicateMatch;
}

async function askSameCard(borderline: Borderline[]): Promise<Map<string, DedupVerdict>> {
  try {
    const { output, prompt } = await runCardDedupEscalation(
      borderline.map((entry) => entry.pair),
      CARD_DEDUP_ESCALATION_CARD_CHARS,
    );

    return validateDedupEscalation(output, prompt);
  } catch (err) {
    log.warn({ err }, "card_dedup_escalation_failed");

    return new Map();
  }
}

export async function runCardDedupScan(): Promise<CardDedupScanResult> {
  const result: CardDedupScanResult = { checked: 0, flagged: 0, escalated: 0 };

  if (!isCardDedupEnabled()) {
    return result;
  }

  const bits = await listBitsAwaitingDedup(CARD_DEDUP_BIT_CAP);

  if (bits.length === 0) {
    return result;
  }

  const embedded = await embedTexts(bits.map((bit) => ({ id: bit.id, text: bit.body })));
  const embeddings = new Map(embedded.map((entry) => [entry.id, entry.embedding]));
  const borderline: Borderline[] = [];

  for (const bit of bits) {
    const embedding = embeddings.get(bit.id);

    if (embedding === undefined) {
      continue;
    }

    const candidates = await searchApprovedBitsByEmbedding(
      embedding,
      CARD_DEDUP_CANDIDATES_PER_CARD,
      CARD_DEDUP_BORDERLINE_THRESHOLD,
    );
    const closest = candidates[0];
    const similarBitIds = candidates.map((candidate) => candidate.id);
    const band = closest === undefined ? "distinct" : classifySimilarity(closest.similarity);

    if (closest !== undefined && band === "duplicate") {
      await recordDuplicateCheck(bit.id, {
        bitId: closest.id,
        similarity: closest.similarity,
        reason: CARD_DEDUP_NEAR_IDENTICAL_REASON,
        similarBitIds,
      });
      result.flagged += 1;
    } else if (closest !== undefined && band === "borderline") {
      if (borderline.length < CARD_DEDUP_ESCALATION_PAIR_CAP) {
        borderline.push({
          pair: { bitId: bit.id, newText: bit.body, existingText: closest.body },
          match: { bitId: closest.id, similarity: closest.similarity, reason: null, similarBitIds },
        });
      }

      continue;
    } else {
      await recordDuplicateCheck(bit.id, null);
    }

    result.checked += 1;
  }

  if (borderline.length > 0) {
    const verdicts = await askSameCard(borderline);

    for (const { pair, match } of borderline) {
      const verdict = verdicts.get(pair.bitId);
      const same = verdict?.same === true;

      await recordDuplicateCheck(pair.bitId, same ? { ...match, reason: verdict.reason } : null);
      result.checked += 1;
      result.flagged += same ? 1 : 0;
    }

    result.escalated = borderline.length;
  }

  return result;
}
