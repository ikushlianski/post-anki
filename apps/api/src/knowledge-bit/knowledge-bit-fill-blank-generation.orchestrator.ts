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
      // A token is a pure-underscore blank only if it has no letters/digits mixed in — this is
      // what tells "____" apart from an identifier like __dirname or max_connections.
      const tokens = prompt.success ? (prompt.data.match(/[\p{L}\p{N}_＿]+/gu) ?? []) : [];
      const blankTokens = tokens.filter((token) => /^[_＿]+$/u.test(token));
      const hasExactlyOneBlank = blankTokens.length === 1 && blankTokens[0] === "____";
      const hasSurroundingText =
        prompt.success && hasExactlyOneBlank && prompt.data.replace("____", "").trim().length > 0;

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
