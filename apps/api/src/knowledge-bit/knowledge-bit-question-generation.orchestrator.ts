import { z } from "zod";
import { log } from "../shared/log.js";
import type { VariantGenerationScope } from "./knowledge-bit-variant-generation-gate.js";
import { mapWithConcurrency } from "../shared/map-with-concurrency.js";
import { loadStyleNotesBlocksForBits } from "../card-triage/style-notes-loader.js";
import { runKnowledgeBitQuestionGenerator } from "../mastra/knowledge-bit-question-generator.agent.js";
import {
  looksLikeDifferentScript,
  looksLikeSourceMetaReference,
} from "./knowledge-bit-language-guard.js";
import {
  listKnowledgeBitsForWhQuestionGenerationScan,
  recordGeneratedQuestionVariant,
  markWhQuestionGenerationFailed,
  claimKnowledgeBitForWhQuestionGeneration,
} from "./knowledge-bit-wh-question-claim.repo.js";

// Kept well below the embedding scan's cap — this hits a paid LLM call per bit.
export const QUESTION_GENERATION_CAP = 50;

const ITEM_CONCURRENCY = 4;

type ItemOutcome = "generated" | "failed" | "skipped";

const questionTextSchema = z.string().trim().min(1).max(2000);

export interface QuestionGenerationScanCounts {
  scanned: number;
  generated: number;
  failed: number;
  skipped: number;
}

export async function generateKnowledgeBitQuestions(
  scope: VariantGenerationScope = {},
): Promise<QuestionGenerationScanCounts> {
  const bits = await listKnowledgeBitsForWhQuestionGenerationScan(QUESTION_GENERATION_CAP, scope);

  const styleBlocks = await loadStyleNotesBlocksForBits(bits.map((bit) => bit.id));

  const outcomes = await mapWithConcurrency(
    bits,
    ITEM_CONCURRENCY,
    async (bit): Promise<ItemOutcome> => {
      // Claim before ever calling the LLM — a concurrently running scan that already claimed (or
      // finished) this bit makes this claim fail, and we skip it without paying for a generation.
      const claimToken = await claimKnowledgeBitForWhQuestionGeneration(bit.id, bit.body, scope);

      if (!claimToken) {
        return "skipped";
      }

      try {
        const result = await runKnowledgeBitQuestionGenerator(bit.body, styleBlocks.get(bit.id) ?? "");
        const question = questionTextSchema.safeParse(result.question);
        const answer = questionTextSchema.safeParse(result.answer);

        if (!question.success || !answer.success) {
          throw new Error("knowledge_bit_question_generation_invalid_output");
        }

        if (
          looksLikeDifferentScript(bit.body, question.data) ||
          looksLikeDifferentScript(bit.body, answer.data)
        ) {
          throw new Error("knowledge_bit_question_generation_wrong_language");
        }

        if (
          looksLikeSourceMetaReference(bit.body, question.data) ||
          looksLikeSourceMetaReference(bit.body, answer.data)
        ) {
          throw new Error("knowledge_bit_question_generation_source_meta_reference");
        }

        await recordGeneratedQuestionVariant(
          bit.id,
          "wh_question",
          0,
          question.data,
          answer.data,
          claimToken,
        );
        return "generated";
      } catch (err) {
        log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_question_generation_failed");

        try {
          await markWhQuestionGenerationFailed(bit.id, claimToken);
        } catch (markErr) {
          log.warn(
            { err: markErr, knowledgeBitId: bit.id },
            "knowledge_bit_question_generation_mark_failed_write_failed",
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
