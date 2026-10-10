import { log } from "../shared/log.js";
import { runKnowledgeBitBasicCardGenerator } from "../mastra/knowledge-bit-basic-card-generator.agent.js";
import { validateBasicCard } from "./knowledge-bit-basic-card-validation.js";
import {
  listKnowledgeBitsForBasicCardGenerationScan,
  recordGeneratedBasicCardVariant,
  markBasicCardGenerationFailed,
  claimKnowledgeBitForBasicCardGeneration,
} from "./knowledge-bit-basic-card-claim.repo.js";

export const BASIC_CARD_GENERATION_CAP = 50;

export interface BasicCardGenerationScanCounts {
  scanned: number;
  generated: number;
  failed: number;
  skipped: number;
}

export async function generateKnowledgeBitBasicCards(): Promise<BasicCardGenerationScanCounts> {
  const bits = await listKnowledgeBitsForBasicCardGenerationScan(BASIC_CARD_GENERATION_CAP);

  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const bit of bits) {
    const claimToken = await claimKnowledgeBitForBasicCardGeneration(bit.id, bit.body);

    if (!claimToken) {
      skipped += 1;
      continue;
    }

    try {
      const result = await runKnowledgeBitBasicCardGenerator(bit.body);
      const card = validateBasicCard(result);

      if (!card.ok) {
        throw new Error(`knowledge_bit_basic_card_generation_invalid_output: ${card.reason}`);
      }

      await recordGeneratedBasicCardVariant(bit.id, "basic", 0, card.front, card.back, claimToken);
      generated += 1;
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

      failed += 1;
    }
  }

  return { scanned: bits.length, generated, failed, skipped };
}
