import { describe, it, expect } from "vitest";
import { toEntryState, type PhraseBankEntrySelectRow } from "./phrase-bank.repo.js";

function row(overrides: Partial<PhraseBankEntrySelectRow> = {}): PhraseBankEntrySelectRow {
  return {
    id: "pbentry_1",
    subjectId: "sub_1",
    level: "B1_B2",
    pack: "General",
    phraseText: "get to the bottom of",
    category: "idioms",
    status: "practicing",
    masteryStage: 1,
    correctCountInCycle: 1,
    incorrectCountInCycle: 0,
    lastCorrectAtSentenceCount: 5,
    lastCorrectDate: null,
    scheduledForSentenceCount: 8,
    notes: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    masteredAt: null,
    ...overrides,
  };
}

describe("toEntryState", () => {
  describe("mapping a DB row to the deriver's pure entry shape", () => {
    it("carries id, phraseText, category, and status through unchanged", () => {
      const state = toEntryState(row());

      expect(state).toMatchObject({
        id: "pbentry_1",
        phraseText: "get to the bottom of",
        category: "idioms",
        status: "practicing",
      });
    });

    it("carries the mastery/schedule counters through unchanged", () => {
      const state = toEntryState(row());

      expect(state).toMatchObject({
        masteryStage: 1,
        correctCountInCycle: 1,
        incorrectCountInCycle: 0,
        lastCorrectAtSentenceCount: 5,
        scheduledForSentenceCount: 8,
      });
    });

    it("preserves null for a schedule that was never set", () => {
      const state = toEntryState(row({ scheduledForSentenceCount: null, lastCorrectAtSentenceCount: null }));

      expect(state.scheduledForSentenceCount).toBeNull();
      expect(state.lastCorrectAtSentenceCount).toBeNull();
    });

    it("preserves null for a category-less entry", () => {
      const state = toEntryState(row({ category: null }));

      expect(state.category).toBeNull();
    });

    it("drops timestamp and notes fields the deriver doesn't need", () => {
      const state = toEntryState(row());

      expect(state).not.toHaveProperty("createdAt");
      expect(state).not.toHaveProperty("notes");
    });
  });
});
