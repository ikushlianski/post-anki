import { describe, it, expect } from "vitest";
import {
  selectDuePhrases,
  matchExistingPhraseBankEntry,
  applyAttemptToPhraseBankEntry,
  type PhraseBankEntryState,
} from "./phrase-bank";

function entry(overrides: Partial<PhraseBankEntryState> = {}): PhraseBankEntryState {
  return {
    status: "practicing",
    masteryStage: 0,
    correctCountInCycle: 0,
    incorrectCountInCycle: 0,
    lastCorrectAtSentenceCount: null,
    scheduledForSentenceCount: null,
    ...overrides,
  };
}

describe("selectDuePhrases", () => {
  describe("filtering to entries that are actually due", () => {
    it("selects struggling and practicing entries whose schedule has arrived", () => {
      const entries = [
        { id: "a", ...entry({ status: "struggling", scheduledForSentenceCount: 5 }) },
        { id: "b", ...entry({ status: "practicing", scheduledForSentenceCount: 8 }) },
      ];

      const due = selectDuePhrases(entries, 10, 10);

      expect(due.map((d) => d.id)).toEqual(["a", "b"]);
    });

    it("excludes new and mastered entries even if a schedule value is present", () => {
      const entries = [
        { id: "new", ...entry({ status: "new", scheduledForSentenceCount: 1 }) },
        { id: "mastered", ...entry({ status: "mastered", scheduledForSentenceCount: 1 }) },
      ];

      expect(selectDuePhrases(entries, 10, 10)).toEqual([]);
    });

    it("excludes entries that have never been scheduled", () => {
      const entries = [{ id: "a", ...entry({ status: "practicing", scheduledForSentenceCount: null }) }];

      expect(selectDuePhrases(entries, 10, 10)).toEqual([]);
    });

    it("excludes entries whose scheduled sentence count is still in the future", () => {
      const entries = [{ id: "a", ...entry({ status: "practicing", scheduledForSentenceCount: 20 }) }];

      expect(selectDuePhrases(entries, 10, 10)).toEqual([]);
    });
  });

  describe("ordering and capping", () => {
    it("returns the most-overdue (earliest scheduled) entries first", () => {
      const entries = [
        { id: "later", ...entry({ status: "practicing", scheduledForSentenceCount: 8 }) },
        { id: "earliest", ...entry({ status: "practicing", scheduledForSentenceCount: 2 }) },
        { id: "middle", ...entry({ status: "practicing", scheduledForSentenceCount: 5 }) },
      ];

      const due = selectDuePhrases(entries, 10, 10);

      expect(due.map((d) => d.id)).toEqual(["earliest", "middle", "later"]);
    });

    it("caps the result at maxDue, keeping the most overdue", () => {
      const entries = [
        { id: "a", ...entry({ status: "practicing", scheduledForSentenceCount: 1 }) },
        { id: "b", ...entry({ status: "practicing", scheduledForSentenceCount: 2 }) },
        { id: "c", ...entry({ status: "practicing", scheduledForSentenceCount: 3 }) },
      ];

      const due = selectDuePhrases(entries, 10, 2);

      expect(due.map((d) => d.id)).toEqual(["a", "b"]);
    });
  });

  describe("the very first batch for a subject/level/pack", () => {
    it("returns an empty set when no entries exist yet", () => {
      expect(selectDuePhrases([], 1, 10)).toEqual([]);
    });
  });
});

describe("matchExistingPhraseBankEntry", () => {
  describe("reusing an existing active entry", () => {
    it("matches case-insensitively and ignores surrounding whitespace", () => {
      const candidates = [{ id: "p1", phraseText: "get to the bottom of", status: "practicing" as const }];

      expect(matchExistingPhraseBankEntry(candidates, "  Get To The Bottom Of  ")).toBe("p1");
    });

    it("returns null when no candidate matches the text", () => {
      const candidates = [{ id: "p1", phraseText: "get to the bottom of", status: "practicing" as const }];

      expect(matchExistingPhraseBankEntry(candidates, "drowning in work")).toBeNull();
    });

    it("returns null against an empty candidate list", () => {
      expect(matchExistingPhraseBankEntry([], "anything")).toBeNull();
    });
  });

  describe("mastered entries stay archived", () => {
    it("does not reopen a mastered entry even on an exact text match", () => {
      const candidates = [{ id: "p1", phraseText: "get to the bottom of", status: "mastered" as const }];

      expect(matchExistingPhraseBankEntry(candidates, "get to the bottom of")).toBeNull();
    });

    it("still matches an active entry when a mastered duplicate also exists", () => {
      const candidates = [
        { id: "old", phraseText: "get to the bottom of", status: "mastered" as const },
        { id: "new", phraseText: "get to the bottom of", status: "practicing" as const },
      ];

      expect(matchExistingPhraseBankEntry(candidates, "get to the bottom of")).toBe("new");
    });
  });
});

describe("applyAttemptToPhraseBankEntry", () => {
  describe("a new phrase enters the bank on its first correct use", () => {
    it("moves the entry to practicing at masteryStage 1", () => {
      const result = applyAttemptToPhraseBankEntry(entry({ status: "new" }), {
        sequenceNumber: 1,
        verdict: "Ok",
      });

      expect(result.entry).toMatchObject({
        status: "practicing",
        masteryStage: 1,
        correctCountInCycle: 1,
        lastCorrectAtSentenceCount: 1,
      });
      expect(result.appearance).toEqual({ result: "correct", wasOverdue: false });
    });

    it("schedules the entry for recycling roughly 3 sentences later", () => {
      const result = applyAttemptToPhraseBankEntry(entry({ status: "new" }), {
        sequenceNumber: 1,
        verdict: "Ok",
      });

      expect(result.entry.scheduledForSentenceCount).toBe(4);
    });
  });

  describe("three non-adjacent correct uses archive a phrase as mastered", () => {
    it("reaches status mastered after the third non-adjacent correct attempt", () => {
      let state = entry({ status: "new" });

      const first = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 1, verdict: "Ok" });
      state = first.entry;
      expect(state).toMatchObject({ status: "practicing", masteryStage: 1 });

      const second = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 5, verdict: "Ok" });
      state = second.entry;
      expect(state).toMatchObject({ status: "practicing", masteryStage: 2 });

      const third = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 9, verdict: "Ok" });
      state = third.entry;

      expect(state).toMatchObject({ status: "mastered", masteryStage: 3 });
    });

    it("no longer looks due once mastered", () => {
      const mastered = entry({
        status: "mastered",
        masteryStage: 3,
        scheduledForSentenceCount: 9,
      });

      expect(selectDuePhrases([{ id: "m", ...mastered }], 100, 10)).toEqual([]);
    });
  });

  describe("two correct answers in immediate succession don't double-count toward mastery", () => {
    it("does not advance the mastery counter on the adjacent (back-to-back) repeat", () => {
      let state = entry({ status: "new" });

      const first = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 5, verdict: "Ok" });
      state = first.entry;
      expect(state.masteryStage).toBe(1);

      const second = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 6, verdict: "Ok" });
      state = second.entry;

      expect(state.masteryStage).toBe(1);
      expect(state.status).not.toBe("mastered");
    });

    it("does not reach mastered from two adjacent corrects plus one more", () => {
      let state = entry({ status: "new" });

      state = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 5, verdict: "Ok" }).entry;
      state = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 6, verdict: "Ok" }).entry;
      state = applyAttemptToPhraseBankEntry(state, { sequenceNumber: 9, verdict: "Ok" }).entry;

      expect(state.status).not.toBe("mastered");
      expect(state.masteryStage).toBeLessThan(3);
    });
  });

  describe("a practicing phrase fails and rolls back to isolation, not to zero", () => {
    it("resets masteryStage and correctCountInCycle to 0 while incorrectCountInCycle increments", () => {
      const practicing = entry({
        status: "practicing",
        masteryStage: 1,
        correctCountInCycle: 1,
        incorrectCountInCycle: 2,
        lastCorrectAtSentenceCount: 3,
      });

      const result = applyAttemptToPhraseBankEntry(practicing, { sequenceNumber: 4, verdict: "NeedsDeepDive" });

      expect(result.entry).toMatchObject({
        status: "struggling",
        masteryStage: 0,
        correctCountInCycle: 0,
        incorrectCountInCycle: 3,
      });
    });

    it("preserves lifetime counters rather than resetting the entry to new", () => {
      const practicing = entry({
        status: "practicing",
        masteryStage: 2,
        incorrectCountInCycle: 1,
      });

      const result = applyAttemptToPhraseBankEntry(practicing, { sequenceNumber: 10, verdict: "NeedsReview" });

      expect(result.entry.status).toBe("struggling");
      expect(result.entry.status).not.toBe("new");
      expect(result.entry.incorrectCountInCycle).toBe(2);
    });

    it("reschedules the entry for recycling roughly 3 sentences later", () => {
      const practicing = entry({ status: "practicing" });

      const result = applyAttemptToPhraseBankEntry(practicing, { sequenceNumber: 10, verdict: "NeedsReview" });

      expect(result.entry.scheduledForSentenceCount).toBe(13);
    });

    it("records the appearance as incorrect", () => {
      const practicing = entry({ status: "practicing" });

      const result = applyAttemptToPhraseBankEntry(practicing, { sequenceNumber: 10, verdict: "NeedsDeepDive" });

      expect(result.appearance.result).toBe("incorrect");
    });
  });

  describe("verdict to correct/incorrect mapping", () => {
    it("maps Ok to a correct result", () => {
      const result = applyAttemptToPhraseBankEntry(entry(), { sequenceNumber: 1, verdict: "Ok" });

      expect(result.appearance.result).toBe("correct");
    });

    it("maps NeedsReview to an incorrect result internally", () => {
      const result = applyAttemptToPhraseBankEntry(entry(), { sequenceNumber: 1, verdict: "NeedsReview" });

      expect(result.appearance.result).toBe("incorrect");
      expect(result.entry.status).toBe("struggling");
    });

    it("maps NeedsDeepDive to an incorrect result internally", () => {
      const result = applyAttemptToPhraseBankEntry(entry(), { sequenceNumber: 1, verdict: "NeedsDeepDive" });

      expect(result.appearance.result).toBe("incorrect");
      expect(result.entry.status).toBe("struggling");
    });
  });

  describe("wasOverdue", () => {
    it("is false for a brand-new entry with no schedule yet", () => {
      const result = applyAttemptToPhraseBankEntry(entry({ status: "new" }), {
        sequenceNumber: 1,
        verdict: "Ok",
      });

      expect(result.appearance.wasOverdue).toBe(false);
    });

    it("is true once the appearance lands at or after the scheduled sentence count", () => {
      const due = entry({ status: "practicing", scheduledForSentenceCount: 5 });

      const result = applyAttemptToPhraseBankEntry(due, { sequenceNumber: 5, verdict: "Ok" });

      expect(result.appearance.wasOverdue).toBe(true);
    });

    it("is false when the appearance lands before the scheduled sentence count", () => {
      const notYetDue = entry({ status: "practicing", scheduledForSentenceCount: 5 });

      const result = applyAttemptToPhraseBankEntry(notYetDue, { sequenceNumber: 3, verdict: "Ok" });

      expect(result.appearance.wasOverdue).toBe(false);
    });
  });

  describe("a mastered entry is not reopened by a later attempt", () => {
    it("keeps status mastered regardless of the attempt's verdict", () => {
      const mastered = entry({ status: "mastered", masteryStage: 3 });

      const result = applyAttemptToPhraseBankEntry(mastered, { sequenceNumber: 20, verdict: "NeedsDeepDive" });

      expect(result.entry.status).toBe("mastered");
    });
  });
});
