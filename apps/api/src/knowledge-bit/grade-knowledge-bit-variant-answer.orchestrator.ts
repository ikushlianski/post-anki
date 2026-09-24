import { runKnowledgeBitAnswerGrader } from "../mastra/knowledge-bit-answer-grader.agent.js";
import { runKnowledgeBitFollowupGenerator } from "../mastra/knowledge-bit-followup-generator.agent.js";
import { log } from "../shared/log.js";
import { listAssignmentsForNodes } from "../tag/tag.repo.js";
import {
  getQuestionVariantById,
  insertVariantAttempt,
} from "./knowledge-bit-variant-attempt.repo.js";
import type { KnowledgeBitAnswerGraderResult } from "../mastra/knowledge-bit-answer-grader.agent.js";

export type GradeKnowledgeBitVariantAnswerResult =
  | ({ ok: true; followUpQuestion: string | null; tagIds: string[] } & KnowledgeBitAnswerGraderResult)
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
  // the follow-up question or the tag lookup failed — fail soft on each independently, and run
  // them concurrently since neither depends on the other's result.
  const [followUpSettled, tagsSettled] = await Promise.allSettled([
    runKnowledgeBitFollowupGenerator(
      variant.kind,
      variant.prompt,
      variant.answer,
      userAnswer,
      grade.verdict,
      grade.feedback,
    ),
    listAssignmentsForNodes([variant.knowledgeBitId]),
  ]);

  let followUpQuestion: string | null = null;

  if (followUpSettled.status === "fulfilled") {
    followUpQuestion = followUpSettled.value.followUpQuestion;
  } else {
    log.error({ err: followUpSettled.reason, variantId }, "knowledge_bit_followup_generation_failed");
  }

  let tagIds: string[] = [];

  if (tagsSettled.status === "fulfilled") {
    tagIds = tagsSettled.value.map((assignment) => assignment.tagId);
  } else {
    log.error({ err: tagsSettled.reason, variantId }, "knowledge_bit_variant_answer_tag_lookup_failed");
  }

  return { ok: true, ...grade, followUpQuestion, tagIds };
}
