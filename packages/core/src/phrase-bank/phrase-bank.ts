export type PhraseBankStatus = "new" | "practicing" | "struggling" | "mastered";

export type PhraseBankVerdict = "Ok" | "NeedsReview" | "NeedsDeepDive";

const RECYCLE_OFFSET = 3;
const MASTERY_THRESHOLD = 3;

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

export function selectDuePhrases<T extends PhraseBankEntryState>(
  entries: T[],
  currentSequenceNumber: number,
  maxDue: number,
): T[] {
  return entries
    .filter(
      (entry) =>
        (entry.status === "struggling" || entry.status === "practicing") &&
        entry.scheduledForSentenceCount !== null &&
        entry.scheduledForSentenceCount <= currentSequenceNumber,
    )
    .sort((a, b) => a.scheduledForSentenceCount! - b.scheduledForSentenceCount!)
    .slice(0, maxDue);
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

export function applyAttemptToPhraseBankEntry<T extends PhraseBankEntryState>(
  entry: T,
  attempt: PhraseBankAttempt,
): ApplyAttemptResult<T> {
  const correct = isCorrectVerdict(attempt.verdict);
  const wasOverdue =
    entry.scheduledForSentenceCount !== null &&
    attempt.sequenceNumber >= entry.scheduledForSentenceCount;

  if (entry.status === "mastered") {
    return { entry, appearance: { result: correct ? "correct" : "incorrect", wasOverdue } };
  }

  if (!correct) {
    return {
      entry: {
        ...entry,
        status: "struggling",
        masteryStage: 0,
        correctCountInCycle: 0,
        incorrectCountInCycle: entry.incorrectCountInCycle + 1,
        scheduledForSentenceCount: attempt.sequenceNumber + RECYCLE_OFFSET,
      },
      appearance: { result: "incorrect", wasOverdue },
    };
  }

  const isAdjacent =
    entry.lastCorrectAtSentenceCount !== null &&
    attempt.sequenceNumber === entry.lastCorrectAtSentenceCount + 1;

  const nextMasteryStage = isAdjacent ? entry.masteryStage : entry.masteryStage + 1;
  const nextCorrectCount = isAdjacent ? entry.correctCountInCycle : entry.correctCountInCycle + 1;
  const reachedMastery = nextMasteryStage >= MASTERY_THRESHOLD;

  return {
    entry: {
      ...entry,
      status: reachedMastery ? "mastered" : "practicing",
      masteryStage: nextMasteryStage,
      correctCountInCycle: nextCorrectCount,
      lastCorrectAtSentenceCount: attempt.sequenceNumber,
      scheduledForSentenceCount: attempt.sequenceNumber + RECYCLE_OFFSET,
    },
    appearance: { result: "correct", wasOverdue },
  };
}
