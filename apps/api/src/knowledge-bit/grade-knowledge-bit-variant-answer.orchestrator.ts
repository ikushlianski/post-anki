import { runKnowledgeBitAnswerGrader } from "../mastra/knowledge-bit-answer-grader.agent.js";
import { runKnowledgeBitFollowupGenerator } from "../mastra/knowledge-bit-followup-generator.agent.js";
import { log } from "../shared/log.js";
import {
  getQuestionVariantById,
  insertVariantAttempt,
} from "./knowledge-bit-variant-attempt.repo.js";
import type { KnowledgeBitAnswerGraderResult } from "../mastra/knowledge-bit-answer-grader.agent.js";

export type GradeKnowledgeBitVariantAnswerResult =
  | ({ ok: true; followUpQuestion: string | null } & KnowledgeBitAnswerGraderResult)
  | { ok: false; error: "variant_not_found" };

export async function gradeKnowledgeBitVariantAnswer(
  variantId: string,
  userAnswer: string,
): Promise<GradeKnowledgeBitVariantAnswerResult> {
  const variant = await getQuestionVariantById(variantId);

  if (!variant) {
    return { ok: false, error: "variant_not_found" };
  }

  const grade = await runKnowledgeBitAnswerGrader(
    variant.kind,
    variant.prompt,
    variant.answer,
    userAnswer,
  );

  await insertVariantAttempt({
    variantId,
    userAnswer,
    score: grade.score,
    verdict: grade.verdict,
    feedback: grade.feedback,
  });

  // Already-graded, already-persisted answer must not turn into an error response just because
  // the follow-up question failed to generate — fail soft and omit it instead.
  let followUpQuestion: string | null = null;

  try {
    const followUp = await runKnowledgeBitFollowupGenerator(
      variant.prompt,
      variant.answer,
      userAnswer,
      grade.verdict,
      grade.feedback,
    );

    followUpQuestion = followUp.followUpQuestion;
  } catch (err) {
    log.error({ err, variantId }, "knowledge_bit_followup_generation_failed");
  }

  return { ok: true, ...grade, followUpQuestion };
}
