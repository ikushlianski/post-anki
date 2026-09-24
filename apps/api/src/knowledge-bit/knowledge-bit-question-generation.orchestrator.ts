import { z } from "zod";
import { log } from "../shared/log.js";
import { runKnowledgeBitQuestionGenerator } from "../mastra/knowledge-bit-question-generator.agent.js";
import {
  listKnowledgeBitsForQuestionGenerationScan,
  recordGeneratedQuestionVariant,
  markWhQuestionGenerationFailed,
} from "./knowledge-bit-question-variant.repo.js";

// Kept well below the embedding scan's cap — this hits a paid LLM call per bit.
export const QUESTION_GENERATION_CAP = 50;

const questionTextSchema = z.string().trim().min(1).max(2000);

export interface QuestionGenerationScanCounts {
  scanned: number;
  generated: number;
  failed: number;
}

export async function generateKnowledgeBitQuestions(): Promise<QuestionGenerationScanCounts> {
  const bits = await listKnowledgeBitsForQuestionGenerationScan(QUESTION_GENERATION_CAP);

  let generated = 0;
  let failed = 0;

  for (const bit of bits) {
    try {
      const result = await runKnowledgeBitQuestionGenerator(bit.body);
      const question = questionTextSchema.safeParse(result.question);
      const answer = questionTextSchema.safeParse(result.answer);

      if (!question.success || !answer.success) {
        throw new Error("knowledge_bit_question_generation_invalid_output");
      }

      await recordGeneratedQuestionVariant(bit.id, "wh_question", 0, question.data, answer.data);
      generated += 1;
    } catch (err) {
      log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_question_generation_failed");

      try {
        await markWhQuestionGenerationFailed(bit.id);
      } catch (markErr) {
        log.warn(
          { err: markErr, knowledgeBitId: bit.id },
          "knowledge_bit_question_generation_mark_failed_write_failed",
        );
      }

      failed += 1;
    }
  }

  return { scanned: bits.length, generated, failed };
}
