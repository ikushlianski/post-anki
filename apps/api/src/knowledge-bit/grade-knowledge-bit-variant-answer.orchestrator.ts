import { runKnowledgeBitAnswerGrader } from "../mastra/knowledge-bit-answer-grader.agent.js";
import {
  getQuestionVariantById,
  insertVariantAttempt,
} from "./knowledge-bit-variant-attempt.repo.js";
import type { KnowledgeBitAnswerGraderResult } from "../mastra/knowledge-bit-answer-grader.agent.js";

export type GradeKnowledgeBitVariantAnswerResult =
  | ({ ok: true } & KnowledgeBitAnswerGraderResult)
  | { ok: false; error: "variant_not_found" };

export async function gradeKnowledgeBitVariantAnswer(
  variantId: string,
  userAnswer: string,
): Promise<GradeKnowledgeBitVariantAnswerResult> {
  const variant = await getQuestionVariantById(variantId);

  if (!variant) {
    return { ok: false, error: "variant_not_found" };
  }

  const grade = await runKnowledgeBitAnswerGrader(variant.prompt, variant.answer, userAnswer);

  await insertVariantAttempt({
    variantId,
    userAnswer,
    score: grade.score,
    verdict: grade.verdict,
    feedback: grade.feedback,
  });

  return { ok: true, ...grade };
}
