import { z } from "zod";
import { log } from "../shared/log.js";
import { runKnowledgeBitFillBlankGenerator } from "../mastra/knowledge-bit-fill-blank-generator.agent.js";
import {
  listKnowledgeBitsForFillBlankGenerationScan,
  recordGeneratedFillBlankVariant,
  markFillBlankGenerationFailed,
} from "./knowledge-bit-question-variant.repo.js";

// Kept well below the embedding scan's cap — this hits a paid LLM call per bit.
export const FILL_BLANK_GENERATION_CAP = 50;

const fillBlankTextSchema = z.string().trim().min(1).max(2000);

export interface FillBlankGenerationScanCounts {
  scanned: number;
  generated: number;
  failed: number;
}

export async function generateKnowledgeBitFillBlanks(): Promise<FillBlankGenerationScanCounts> {
  const bits = await listKnowledgeBitsForFillBlankGenerationScan(FILL_BLANK_GENERATION_CAP);

  let generated = 0;
  let failed = 0;

  for (const bit of bits) {
    try {
      const result = await runKnowledgeBitFillBlankGenerator(bit.body);
      const prompt = fillBlankTextSchema.safeParse(result.prompt);
      const answer = fillBlankTextSchema.safeParse(result.answer);
      // Exactly one standalone blank of exactly four underscores, with real text around it — a
      // second blank (any length, any underscore-like character), a bare blank with no context,
      // or an underscore embedded in a word (an identifier like max_connections) must not count.
      const standaloneBlank = /(?<![\p{L}\p{N}])[_＿]+(?![\p{L}\p{N}])/gu;
      const blankRuns = prompt.success ? (prompt.data.match(standaloneBlank) ?? []) : [];
      const hasExactlyOneBlank = blankRuns.length === 1 && blankRuns[0] === "____";
      const hasSurroundingText =
        prompt.success && prompt.data.replace(standaloneBlank, "").trim().length > 0;

      if (!prompt.success || !answer.success || !hasExactlyOneBlank || !hasSurroundingText) {
        throw new Error("knowledge_bit_fill_blank_generation_invalid_output");
      }

      await recordGeneratedFillBlankVariant(bit.id, "fill_in_the_blank", 0, prompt.data, answer.data);
      generated += 1;
    } catch (err) {
      log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_fill_blank_generation_failed");

      try {
        await markFillBlankGenerationFailed(bit.id);
      } catch (markErr) {
        log.warn(
          { err: markErr, knowledgeBitId: bit.id },
          "knowledge_bit_fill_blank_generation_mark_failed_write_failed",
        );
      }

      failed += 1;
    }
  }

  return { scanned: bits.length, generated, failed };
}
