// Read-time mastery fold for a tag's scored knowledge-bit answers — no persisted cursor, no new
// table. Reuses applyAttemptToMasteryEntry (this same package) unchanged: the caller already has
// every attempt as a flat, ordered list, so there is nothing here for the shared state machine to
// persist between calls.
import { applyAttemptToMasteryEntry, type MasteryEntryState } from "./mastery-state.js";

const DEFAULT_TAG_MASTERY_ENTRY: MasteryEntryState = {
  status: "new",
  masteryStage: 0,
  correctCountInCycle: 0,
  incorrectCountInCycle: 0,
  lastCorrectAtSequence: null,
  scheduledForSequence: null,
};

export interface TagMasteryAttempt {
  verdict: string;
}

/**
 * Folds a tag's scored answers (already ordered by createdAt ascending by the caller) into a
 * single mastery level. `correct` is `verdict === "Ok"` — the grader's own existing three-way
 * verdict, no separate score threshold. `isAdjacent` is always false: unlike phrase-bank/gap-
 * mastery's dense stream-position semantics, a tag's attempts span unrelated bits/variants, so
 * there is no meaningful "immediate repeat" to detect — every correct attempt advances progress.
 */
export function foldTagMastery(attempts: TagMasteryAttempt[]): MasteryEntryState {
  return attempts.reduce<MasteryEntryState>((entry, attempt, index) => {
    const { entry: nextEntry } = applyAttemptToMasteryEntry(entry, {
      sequenceNumber: index,
      correct: attempt.verdict === "Ok",
      isAdjacent: false,
    });

    return nextEntry;
  }, DEFAULT_TAG_MASTERY_ENTRY);
}
