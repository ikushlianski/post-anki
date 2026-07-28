import { describe, it, expect } from "vitest";
import {
  selectDueMasteryEntries,
  applyAttemptToMasteryEntry,
  type MasteryEntryState,
} from "./mastery-state";

function entry(overrides: Partial<MasteryEntryState> = {}): MasteryEntryState {
  return {
    status: "practicing",
    masteryStage: 0,
    correctCountInCycle: 0,
    incorrectCountInCycle: 0,
    lastCorrectAtSequence: null,
    scheduledForSequence: null,
    ...overrides,
  };
}

describe("selectDueMasteryEntries", () => {
  it("selects struggling and practicing entries whose schedule has arrived, most-overdue first, capped at maxDue", () => {
    const entries = [
      { id: "later", ...entry({ status: "practicing", scheduledForSequence: 8 }) },
      { id: "earliest", ...entry({ status: "struggling", scheduledForSequence: 2 }) },
      { id: "new", ...entry({ status: "new", scheduledForSequence: 1 }) },
      { id: "mastered", ...entry({ status: "mastered", scheduledForSequence: 1 }) },
      { id: "not-due", ...entry({ status: "practicing", scheduledForSequence: 20 }) },
      { id: "never-scheduled", ...entry({ status: "practicing", scheduledForSequence: null }) },
    ];

    const due = selectDueMasteryEntries(entries, 10, 1);

    expect(due.map((d) => d.id)).toEqual(["earliest"]);
  });

  it("returns an empty set when nothing exists yet", () => {
    expect(selectDueMasteryEntries([], 1, 10)).toEqual([]);
  });
});

describe("applyAttemptToMasteryEntry", () => {
  describe("a fresh entry's first correct use", () => {
    it("moves to practicing at masteryStage 1 and schedules recycling at the given offset", () => {
      const result = applyAttemptToMasteryEntry(
        entry({ status: "new" }),
        { sequenceNumber: 1, correct: true, isAdjacent: false },
        10,
      );

      expect(result.entry).toMatchObject({
        status: "practicing",
        masteryStage: 1,
        correctCountInCycle: 1,
        lastCorrectAtSequence: 1,
        scheduledForSequence: 11,
      });
      expect(result.appearance).toEqual({ result: "correct", wasOverdue: false });
    });
  });

  describe("three non-adjacent corrects reach mastered", () => {
    it("reaches status mastered on the third non-adjacent correct attempt", () => {
      let state = entry({ status: "new" });

      state = applyAttemptToMasteryEntry(
        state,
        { sequenceNumber: 1, correct: true, isAdjacent: false },
        10,
      ).entry;
      expect(state).toMatchObject({ status: "practicing", masteryStage: 1 });

      state = applyAttemptToMasteryEntry(
        state,
        { sequenceNumber: 2, correct: true, isAdjacent: false },
        10,
      ).entry;
      expect(state).toMatchObject({ status: "practicing", masteryStage: 2 });

      state = applyAttemptToMasteryEntry(
        state,
        { sequenceNumber: 3, correct: true, isAdjacent: false },
        10,
      ).entry;
      expect(state).toMatchObject({ status: "mastered", masteryStage: 3 });
    });
  });

  describe("a caller-supplied adjacent correct does not advance mastery", () => {
    it("keeps masteryStage unchanged when isAdjacent is true, regardless of sequenceNumber gap", () => {
      let state = entry({ status: "new" });

      state = applyAttemptToMasteryEntry(
        state,
        { sequenceNumber: 1, correct: true, isAdjacent: false },
        10,
      ).entry;
      expect(state.masteryStage).toBe(1);

      // A large sequenceNumber gap would count as non-adjacent under
      // phrase-bank's own +1 rule, but isAdjacent is caller-supplied here —
      // this is the exact contract change (spec.md Decision 4): the
      // function trusts the caller's own domain-specific adjacency signal
      // (e.g. gap-mastery's same-probe-session-id check) rather than
      // deriving it from sequenceNumber itself.
      state = applyAttemptToMasteryEntry(
        state,
        { sequenceNumber: 50, correct: true, isAdjacent: true },
        10,
      ).entry;

      expect(state.masteryStage).toBe(1);
      expect(state.status).not.toBe("mastered");
    });
  });

  describe("an incorrect attempt resets to struggling regardless of isAdjacent", () => {
    it("resets masteryStage/correctCountInCycle to 0 and increments incorrectCountInCycle", () => {
      const practicing = entry({
        status: "practicing",
        masteryStage: 2,
        correctCountInCycle: 2,
        incorrectCountInCycle: 1,
        lastCorrectAtSequence: 5,
      });

      const result = applyAttemptToMasteryEntry(
        practicing,
        { sequenceNumber: 6, correct: false, isAdjacent: false },
        10,
      );

      expect(result.entry).toMatchObject({
        status: "struggling",
        masteryStage: 0,
        correctCountInCycle: 0,
        incorrectCountInCycle: 2,
        scheduledForSequence: 16,
      });
      expect(result.appearance.result).toBe("incorrect");
    });
  });

  describe("a mastered entry is never reopened", () => {
    it("keeps status mastered and does not write scheduling fields regardless of the attempt", () => {
      const mastered = entry({
        status: "mastered",
        masteryStage: 3,
        scheduledForSequence: 9,
        lastCorrectAtSequence: 9,
      });

      const result = applyAttemptToMasteryEntry(
        mastered,
        { sequenceNumber: 40, correct: false, isAdjacent: false },
        10,
      );

      expect(result.entry.status).toBe("mastered");
      expect(result.entry.scheduledForSequence).toBe(9);
      expect(selectDueMasteryEntries([result.entry], 100, 10)).toEqual([]);
    });
  });

  describe("recycleOffset defaults to 3 when not supplied", () => {
    it("schedules the entry 3 sequence positions ahead", () => {
      const result = applyAttemptToMasteryEntry(entry({ status: "new" }), {
        sequenceNumber: 1,
        correct: true,
        isAdjacent: false,
      });

      expect(result.entry.scheduledForSequence).toBe(4);
    });
  });
});
