import {
  selectDueMasteryEntries,
  applyAttemptToMasteryEntry,
  type MasteryEntryState,
} from "../mastery/mastery-state.js";

export type PhraseBankStatus = "new" | "practicing" | "struggling" | "mastered";

export type PhraseBankVerdict = "Ok" | "NeedsReview" | "NeedsDeepDive";

// Kept as this file's own constant (not imported from mastery-state.ts,
// which defaults to the same value) — phrase-bank.ts's behavior must stay
// pinned to 3 regardless of what the generic default happens to be, since
// this is the "zero behavior change" surface the existing test suite locks.
const RECYCLE_OFFSET = 3;

export interface PhraseBankEntryState {
  status: PhraseBankStatus;
  masteryStage: number;
  correctCountInCycle: number;
  incorrectCountInCycle: number;
  lastCorrectAtSentenceCount: number | null;
  scheduledForSentenceCount: number | null;
}

export interface PhraseBankAttempt {
  sequenceNumber: number;
  verdict: PhraseBankVerdict;
}

export interface PhraseBankAppearanceResult {
  result: "correct" | "incorrect";
  wasOverdue: boolean;
}

export interface ApplyAttemptResult<T extends PhraseBankEntryState> {
  entry: T;
  appearance: PhraseBankAppearanceResult;
}

function toGenericState<T extends PhraseBankEntryState>(
  entry: T,
): T & MasteryEntryState {
  return {
    ...entry,
    lastCorrectAtSequence: entry.lastCorrectAtSentenceCount,
    scheduledForSequence: entry.scheduledForSentenceCount,
  };
}

function fromGenericState<T extends PhraseBankEntryState>(
  generic: T & MasteryEntryState,
): T {
  const { lastCorrectAtSequence, scheduledForSequence, ...rest } = generic;

  return {
    ...rest,
    lastCorrectAtSentenceCount: lastCorrectAtSequence,
    scheduledForSentenceCount: scheduledForSequence,
  } as unknown as T;
}

/**
 * Thin wrapper over the generalized `selectDueMasteryEntries` (packages/core/
 * src/mastery/mastery-state.ts) — translates phrase-bank's own
 * `*SentenceCount` field names to the generic `*Sequence` names and back.
 * Zero behavior change: same filter/sort/cap logic, same field values.
 */
export function selectDuePhrases<T extends PhraseBankEntryState>(
  entries: T[],
  currentSequenceNumber: number,
  maxDue: number,
): T[] {
  const generic = entries.map((entry) => toGenericState(entry));
  const due = selectDueMasteryEntries(generic, currentSequenceNumber, maxDue);

  return due.map((entry) => fromGenericState(entry));
}

export interface PhraseBankCandidate {
  id: string;
  phraseText: string;
  status: PhraseBankStatus;
}

export function matchExistingPhraseBankEntry(
  candidates: PhraseBankCandidate[],
  phraseText: string,
): string | null {
  const normalized = normalizePhraseText(phraseText);
  const match = candidates.find(
    (candidate) =>
      candidate.status !== "mastered" && normalizePhraseText(candidate.phraseText) === normalized,
  );

  return match?.id ?? null;
}

function normalizePhraseText(text: string): string {
  return text.trim().toLowerCase();
}

function isCorrectVerdict(verdict: PhraseBankVerdict): boolean {
  return verdict === "Ok";
}

/**
 * Thin wrapper over the generalized `applyAttemptToMasteryEntry` (packages/
 * core/src/mastery/mastery-state.ts) — this file's entire diff for the
 * generalization work (spec.md Decision 4). Computes `isAdjacent` exactly
 * the way this function always has (the immediately-next sentence position),
 * translates field names to/from the generic shape, and passes phrase-bank's
 * own RECYCLE_OFFSET (3) explicitly so the generic function's schedule math
 * matches this file's existing behavior exactly regardless of the generic
 * default. Zero behavior change — same transitions, same field values, same
 * exported name/signature this file has always had.
 */
export function applyAttemptToPhraseBankEntry<T extends PhraseBankEntryState>(
  entry: T,
  attempt: PhraseBankAttempt,
): ApplyAttemptResult<T> {
  const correct = isCorrectVerdict(attempt.verdict);
  const isAdjacent =
    entry.lastCorrectAtSentenceCount !== null &&
    attempt.sequenceNumber === entry.lastCorrectAtSentenceCount + 1;

  const result = applyAttemptToMasteryEntry(
    toGenericState(entry),
    { sequenceNumber: attempt.sequenceNumber, correct, isAdjacent },
    RECYCLE_OFFSET,
  );

  return {
    entry: fromGenericState(result.entry),
    appearance: result.appearance,
  };
}
