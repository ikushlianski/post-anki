export type ActivePhraseBankStatus = "new" | "practicing" | "struggling";

export interface DeriveActivePhraseBankStatusInput {
  masteryStage: number;
  mode: "mixed" | "isolation";
}

// SCENARIO 2 — isolation is checked before masteryStage: an incorrect source
// attempt sets mode: "isolation" and can drop masteryStage back to 0 in that
// same update, so checking masteryStage first would misclassify a
// just-failed phrase as brand-new and lose that "needs isolated retry"
// signal entirely.
export function deriveActivePhraseBankStatus(
  input: DeriveActivePhraseBankStatusInput,
): ActivePhraseBankStatus {
  if (input.mode === "isolation") {
    return "struggling";
  }

  if (input.masteryStage === 0) {
    return "new";
  }

  return "practicing";
}

export interface RenumberedActiveEntrySchedule {
  lastCorrectAtSentenceCount: null;
  scheduledForSentenceCount: number;
}

// SCENARIO 3 / Decision 15 — scheduledForSentenceCount is the scope's
// post-import max sequenceNumber EXACTLY (not +1): the next live batch reads
// nextSequenceBase before inserting its own rows, so it observes this same
// unchanged max, and the due comparison (scheduledForSentenceCount <=
// currentSequenceNumber) only holds on that very next batch if the two
// values are equal.
//
// lastCorrectAtSentenceCount is always null, never currentMaxSequence.
// applyAttemptToPhraseBankEntry computes isAdjacent as
// `attempt.sequenceNumber === lastCorrectAtSentenceCount + 1`, and a
// recycled entry's first post-import attempt lands at exactly
// `scheduledForSentenceCount + 1` (the next batch's first assigned sequence
// number) — storing currentMaxSequence here would make that very next
// correct answer register as adjacent, and an adjacent correct answer does
// not advance masteryStage. null guarantees isAdjacent is false there, so a
// genuine recycle-and-succeed event counts normally instead of silently
// doing nothing.
export function renumberActiveEntrySchedule(
  currentMaxSequence: number,
): RenumberedActiveEntrySchedule {
  return {
    lastCorrectAtSentenceCount: null,
    scheduledForSentenceCount: currentMaxSequence,
  };
}

export interface SequenceableSourcePhrase {
  id: string;
  createdAt: string;
}

// SCENARIO 1, SCENARIO 10 — assigns sequenceNumber in ascending createdAt
// order, continuing from a level's own real nextSequenceBase in the target
// (never assumed to start at zero), so a second, later migration run for a
// level that already has live-generated data does not collide with real
// sequence numbers.
export function assignSequenceNumbersByCreatedAt<T extends SequenceableSourcePhrase>(
  phrasesToAssign: T[],
  startingBase: number,
): (T & { sequenceNumber: number })[] {
  const sorted = [...phrasesToAssign].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return sorted.map((phrase, index) => ({
    ...phrase,
    sequenceNumber: startingBase + index + 1,
  }));
}

// SCENARIO 4 — deterministic, prefixed id derived from a stable natural key
// in the source, never newId()'s random suffix, so a second run's
// existing-row check (SELECT by this id before INSERT) can actually detect
// "already imported" rows.
export function buildImportId(prefix: string, sourceKey: string): string {
  return `${prefix}_import_${sourceKey}`;
}
