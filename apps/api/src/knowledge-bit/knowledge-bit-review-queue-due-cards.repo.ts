import { and, asc, eq, inArray, isNull, lte, not, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { phaseRank } from "./knowledge-bit-review-queue-learning.repo.js";
import type { Picked } from "./knowledge-bit-review-queue-picked.repo.js";
import {
  defaultStepsFor,
  toCard,
  type StepsFor,
} from "./knowledge-bit-review-queue-cards.repo.js";
import type { KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";
import type { DueReviewsBySubject } from "./knowledge-bit-review-allowance.repo.js";

const STEP_PHASES = ["learning", "relearning"];

const notYetDueRank = (picked: Picked, now: Date) =>
  sql<number>`case when ${picked.dueAt} > ${now.toISOString()}::timestamptz then 1 else 0 end`;

const dueColumns = (picked: Picked) => ({
  variantId: picked.variantId,
  knowledgeBitId: picked.knowledgeBitId,
  kind: picked.kind,
  cardKey: picked.cardKey,
  prompt: picked.prompt,
  context: picked.context,
  answer: picked.answer,
  sentence: picked.sentence,
  background: picked.background,
  body: picked.body,
  reviewCount: picked.reviewCount,
  isAiGenerated: picked.isAiGenerated,
  aiSuggestion: picked.aiSuggestion,
  sourceLinks: picked.sourceLinks,
  subjectId: picked.subjectId,
  cardSubjectId: picked.cardSubjectId,
  easeFactor: picked.easeFactor,
  intervalDays: picked.intervalDays,
  phase: picked.phase,
  learningStep: picked.learningStep,
  lapses: picked.lapses,
  dueAt: picked.dueAt,
  isNew: sql<boolean>`false`,
});

export async function listCappedDueCards(
  picked: Picked,
  dueReviews: DueReviewsBySubject[],
  remainingFor: (subjectId: string | null) => number,
  limit: number,
  now: Date,
  db: DbExecutor,
  stepsFor: StepsFor = defaultStepsFor,
  dueCutoff: Date = now,
): Promise<KnowledgeBitReviewCardRow[]> {
  if (limit <= 0) {
    return [];
  }

  const order = [asc(notYetDueRank(picked, now)), asc(phaseRank(picked)), asc(picked.dueAt), asc(picked.variantId)];
  const learningPromise = db
    .select(dueColumns(picked))
    .from(picked)
    .where(and(eq(picked.pickRank, 1), lte(picked.dueAt, dueCutoff), inArray(picked.phase, STEP_PHASES)))
    .orderBy(...order)
    .limit(limit);
  const reviewPromises = dueReviews
    .filter((entry) => entry.due > 0)
    .map(async ({ subjectId }) => {
      const take = Math.min(limit, remainingFor(subjectId));

      if (take <= 0) {
        return [];
      }

      return db
        .select(dueColumns(picked))
        .from(picked)
        .where(
          and(
            eq(picked.pickRank, 1),
            lte(picked.dueAt, dueCutoff),
            not(inArray(picked.phase, STEP_PHASES)),
            subjectId === null ? isNull(picked.cardSubjectId) : eq(picked.cardSubjectId, subjectId),
          ),
        )
        .orderBy(...order)
        .limit(take);
    });
  const [learning, ...reviewBatches] = await Promise.all([learningPromise, ...reviewPromises]);
  const rank = (row: { phase: string | null; dueAt: Date | null }) => ({
    notYetDue: row.dueAt && row.dueAt > now ? 1 : 0,
    step: row.phase === "learning" || row.phase === "relearning" ? 0 : 1,
    due: row.dueAt?.getTime() ?? 0,
  });

  return [...(learning ?? []), ...reviewBatches.flat()]
    .sort((a, b) => {
      const left = rank(a);
      const right = rank(b);

      return (
        left.notYetDue - right.notYetDue ||
        left.step - right.step ||
        left.due - right.due ||
        a.variantId.localeCompare(b.variantId)
      );
    })
    .slice(0, limit)
    .map(({ dueAt: _dueAt, ...row }) => toCard(row, now, stepsFor));
}
