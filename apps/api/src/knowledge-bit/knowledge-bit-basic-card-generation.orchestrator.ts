import { log } from "../shared/log.js";
import type { VariantGenerationScope } from "./knowledge-bit-variant-generation-gate.js";
import { mapWithConcurrency } from "../shared/map-with-concurrency.js";
import { loadStyleNotesBlocksForBits } from "../card-triage/style-notes-loader.js";
import { runKnowledgeBitBasicCardGenerator } from "../mastra/knowledge-bit-basic-card-generator.agent.js";
import { validateBasicCard } from "./knowledge-bit-basic-card-validation.js";
import {
  listKnowledgeBitsForBasicCardGenerationScan,
  recordGeneratedBasicCardVariant,
  markBasicCardGenerationFailed,
  claimKnowledgeBitForBasicCardGeneration,
} from "./knowledge-bit-basic-card-claim.repo.js";

export const BASIC_CARD_GENERATION_CAP = 50;

const ITEM_CONCURRENCY = 4;

type ItemOutcome = "generated" | "failed" | "skipped";

export interface BasicCardGenerationScanCounts {
  scanned: number;
  generated: number;
  failed: number;
  skipped: number;
}

export async function generateKnowledgeBitBasicCards(
  scope: VariantGenerationScope = {},
): Promise<BasicCardGenerationScanCounts> {
  const bits = await listKnowledgeBitsForBasicCardGenerationScan(BASIC_CARD_GENERATION_CAP, scope);

  const styleBlocks = await loadStyleNotesBlocksForBits(bits.map((bit) => bit.id));

  const outcomes = await mapWithConcurrency(
    bits,
    ITEM_CONCURRENCY,
    async (bit): Promise<ItemOutcome> => {
      const claimToken = await claimKnowledgeBitForBasicCardGeneration(bit.id, bit.body, scope);

      if (!claimToken) {
        return "skipped";
      }

      try {
        const result = await runKnowledgeBitBasicCardGenerator(bit.body, styleBlocks.get(bit.id) ?? "");
        const card = validateBasicCard(result, bit.body);

        if (!card.ok) {
          throw new Error(`knowledge_bit_basic_card_generation_invalid_output: ${card.reason}`);
        }

        await recordGeneratedBasicCardVariant(bit.id, "basic", 0, card.front, card.back, claimToken);
        return "generated";
      } catch (err) {
        log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_basic_card_generation_failed");

        try {
          await markBasicCardGenerationFailed(bit.id, claimToken);
        } catch (markErr) {
          log.warn(
            { err: markErr, knowledgeBitId: bit.id },
            "knowledge_bit_basic_card_generation_mark_failed_write_failed",
          );
        }

        return "failed";
      }
    },
  );

  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      throw outcome.reason;
    }

    if (outcome.value === "generated") {
      generated += 1;
    } else if (outcome.value === "failed") {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return { scanned: bits.length, generated, failed, skipped };
}
