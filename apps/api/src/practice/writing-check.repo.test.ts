import { describe, it, expect } from "vitest";
import { toWritingCheck, type WritingCheckSelectRow } from "./writing-check.repo.js";

function row(overrides: Partial<WritingCheckSelectRow> = {}): WritingCheckSelectRow {
  return {
    id: "writingcheck_1",
    subjectId: "sub_1",
    text: "hey can u take a look at this PR when u get a sec",
    score: 9,
    verdict: "Ok",
    feedback: "Sounds like a real coworker message, nice and casual.",
    nativeAlternatives: ["Hey, could you take a look at this PR when you get a sec?"],
    createdAt: new Date("2026-07-28T00:00:00.000Z"),
    ...overrides,
  };
}

describe("toWritingCheck", () => {
  describe("mapping a DB row to the shared WritingCheck shape", () => {
    it("carries id, subjectId, text, score, and feedback through unchanged", () => {
      const check = toWritingCheck(row());

      expect(check).toMatchObject({
        id: "writingcheck_1",
        subjectId: "sub_1",
        text: "hey can u take a look at this PR when u get a sec",
        score: 9,
        feedback: "Sounds like a real coworker message, nice and casual.",
      });
    });

    it("carries nativeAlternatives through as a real array, not a stringified blob", () => {
      const check = toWritingCheck(row());

      expect(Array.isArray(check.nativeAlternatives)).toBe(true);
      expect(check.nativeAlternatives).toEqual([
        "Hey, could you take a look at this PR when you get a sec?",
      ]);
    });

    it("preserves the verdict value across all three bands", () => {
      expect(toWritingCheck(row({ verdict: "Ok" })).verdict).toBe("Ok");
      expect(toWritingCheck(row({ verdict: "NeedsReview" })).verdict).toBe("NeedsReview");
      expect(toWritingCheck(row({ verdict: "NeedsDeepDive" })).verdict).toBe("NeedsDeepDive");
    });

    it("serializes createdAt to an ISO string, not a Date instance", () => {
      const check = toWritingCheck(row({ createdAt: new Date("2026-07-28T12:34:56.000Z") }));

      expect(check.createdAt).toBe("2026-07-28T12:34:56.000Z");
      expect(typeof check.createdAt).toBe("string");
    });
  });
});
