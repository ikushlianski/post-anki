// Generalized recall-recycling mastery state machine (issue #57) — extracted
// from packages/core/src/phrase-bank/phrase-bank.ts, which already declared
// its transition logic fully generically (no phrase-specific fields existed
// in the state/attempt shape being generalized). phrase-bank.ts now keeps a
// thin wrapper (applyAttemptToPhraseBankEntry / selectDuePhrases) over these
// functions so its own existing test suite passes completely unmodified —
// see that file's comments for the exact translation.
//
// Contract change vs. the original phrase-bank-only version (spec.md
// Decision 4): the attempt's `isAdjacent` is now a CALLER-SUPPLIED boolean
// instead of being derived internally from `sequenceNumber === lastCorrect +
// 1`. That rule is a fine domain-specific fit for phrase-bank's dense
// stream-position semantics, but does not transfer to gap-mastery's "was
// this basically an immediate repeat within the same probe_sessions row"
// semantics — the domain-specific knowledge of what counts as "adjacent"
// now lives at the caller, where it belongs.
export type MasteryStatus = "new" | "practicing" | "struggling" | "mastered";

const DEFAULT_RECYCLE_OFFSET = 3;
const MASTERY_THRESHOLD = 3;

export interface MasteryEntryState {
  status: MasteryStatus;
  masteryStage: number;
  correctCountInCycle: number;
  incorrectCountInCycle: number;
  lastCorrectAtSequence: number | null;
  scheduledForSequence: number | null;
}

export interface MasteryAttempt {
  sequenceNumber: number;
  correct: boolean;
  // Caller-supplied — see the file header. On an incorrect attempt this
  // value is irrelevant/unused (the incorrect branch always resets
  // masteryStage to 0 regardless), ported unchanged from phrase-bank's own
  // incorrect branch, which never consulted isAdjacent either.
  isAdjacent: boolean;
}

export interface MasteryAppearanceResult {
  result: "correct" | "incorrect";
  wasOverdue: boolean;
}

export interface ApplyMasteryAttemptResult<T extends MasteryEntryState> {
  entry: T;
  appearance: MasteryAppearanceResult;
}

/**
 * Filters to entries actually due for recycling: struggling/practicing
 * status, a schedule value set, and that schedule at or before the current
 * sequence position — ordered most-overdue first, capped at maxDue. Reused
 * UNCHANGED for gap_mastery (spec.md's Derivers table): a gap_mastery row is
 * only ever created reactively at answer-time, transitioning directly into
 * "struggling"/"practicing", never "new" — so there is no row this filter
 * would wrongly exclude the way a freshly-generated (but never-attempted)
 * phrase-bank entry at status "new" is correctly excluded here.
 */
export function selectDueMasteryEntries<T extends MasteryEntryState>(
  entries: T[],
  currentSequenceNumber: number,
  maxDue: number,
): T[] {
  return entries
    .filter(
      (entry) =>
        (entry.status === "struggling" || entry.status === "practicing") &&
        entry.scheduledForSequence !== null &&
        entry.scheduledForSequence <= currentSequenceNumber,
    )
    .sort((a, b) => a.scheduledForSequence! - b.scheduledForSequence!)
    .slice(0, maxDue);
}

/**
 * The shared recall-recycling transition: missed it → struggling, recycle
 * it, archive as mastered after `MASTERY_THRESHOLD` (3) non-adjacent
 * corrects. `recycleOffset` controls how far ahead (in the caller's own
 * sequence space) a struggling/practicing entry gets rescheduled —
 * phrase-bank's thin wrapper passes 3 (its own RECYCLE_OFFSET, unchanged
 * behavior); gap-mastery's repo layer passes 10 (one full generation
 * event's worth of questions — the anti-spam guard against re-serving a
 * struggling gap into the very next batch, spec.md Decision 4). Kept as an
 * explicit parameter rather than baked into the attempt shape, since
 * scenarios.md's locked Acceptance blocks pin the attempt shape to exactly
 * `{ sequenceNumber, correct, isAdjacent }`.
 */
export function applyAttemptToMasteryEntry<T extends MasteryEntryState>(
  entry: T,
  attempt: MasteryAttempt,
  recycleOffset: number = DEFAULT_RECYCLE_OFFSET,
): ApplyMasteryAttemptResult<T> {
  const wasOverdue =
    entry.scheduledForSequence !== null &&
    attempt.sequenceNumber >= entry.scheduledForSequence;

  if (entry.status === "mastered") {
    return {
      entry,
      appearance: { result: attempt.correct ? "correct" : "incorrect", wasOverdue },
    };
  }

  if (!attempt.correct) {
    return {
      entry: {
        ...entry,
        status: "struggling",
        masteryStage: 0,
        correctCountInCycle: 0,
        incorrectCountInCycle: entry.incorrectCountInCycle + 1,
        scheduledForSequence: attempt.sequenceNumber + recycleOffset,
      },
      appearance: { result: "incorrect", wasOverdue },
    };
  }

  const nextMasteryStage = attempt.isAdjacent ? entry.masteryStage : entry.masteryStage + 1;
  const nextCorrectCount = attempt.isAdjacent
    ? entry.correctCountInCycle
    : entry.correctCountInCycle + 1;
  const reachedMastery = nextMasteryStage >= MASTERY_THRESHOLD;

  return {
    entry: {
      ...entry,
      status: reachedMastery ? "mastered" : "practicing",
      masteryStage: nextMasteryStage,
      correctCountInCycle: nextCorrectCount,
      lastCorrectAtSequence: attempt.sequenceNumber,
      scheduledForSequence: attempt.sequenceNumber + recycleOffset,
    },
    appearance: { result: "correct", wasOverdue },
  };
}
