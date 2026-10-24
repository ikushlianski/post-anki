import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { LEARN_AHEAD_SECONDS } from "./knowledge-bit-learning-steps.js";
import type { Picked } from "./knowledge-bit-review-queue-picked.repo.js";

const STEP_PHASES = ["learning", "relearning"];

export const learnAheadUntil = (now: Date): Date =>
  new Date(now.getTime() + LEARN_AHEAD_SECONDS * 1000);

export const phaseRank = (picked: Picked) =>
  sql<number>`case when ${picked.phase} in ('learning', 'relearning') then 0 else 1 end`;

export const inStepPhase = (picked: Picked) => inArray(picked.phase, STEP_PHASES);

// Learning cards not yet due but inside the learn-ahead window, used only to fill leftover slots.
export async function listLearnAheadRows(
  picked: Picked,
  limit: number,
  now: Date,
  db: DbExecutor,
) {
  if (limit <= 0) {
    return [];
  }

  return db
    .select({
      variantId: picked.variantId,
      knowledgeBitId: picked.knowledgeBitId,
      kind: picked.kind,
      prompt: picked.prompt,
      answer: picked.answer,
      background: picked.background,
      isAiGenerated: picked.isAiGenerated,
      sourceLinks: picked.sourceLinks,
      easeFactor: picked.easeFactor,
      intervalDays: picked.intervalDays,
      phase: picked.phase,
      learningStep: picked.learningStep,
      lapses: picked.lapses,
      isNew: sql<boolean>`false`,
    })
    .from(picked)
    .where(
      and(
        eq(picked.pickRank, 1),
        inStepPhase(picked),
        gt(picked.dueAt, now),
        lte(picked.dueAt, learnAheadUntil(now)),
      ),
    )
    .orderBy(asc(picked.dueAt), asc(picked.variantId))
    .limit(limit);
}
