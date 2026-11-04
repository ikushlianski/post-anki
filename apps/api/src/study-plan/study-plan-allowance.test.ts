import { describe, expect, it } from "vitest";
import { resolveStudyPlan } from "@post-anki/core";
import { deriveSubjectDayLimit } from "./study-plan-allowance.js";

const APP = {
  newCardsPerDay: 20,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  desiredRetention: 0.9,
};
const CLOCK = { today: "2026-11-05", timeZone: "UTC" };
const examPlan = resolveStudyPlan(
  [
    {
      subjectId: "s",
      options: {},
      studyIntent: "exam",
      examDate: "2027-01-04",
      examPlannedAt: "2026-11-05T08:00:00.000Z",
    },
  ],
  APP,
);

describe("deriveSubjectDayLimit", () => {
  it("should serve the paced number of new cards for an Exam subject", () => {
    const result = deriveSubjectDayLimit({ plan: examPlan, clock: CLOCK, counts: { fresh: 450, waiting: 0 }, usedToday: 0 });

    expect(result).toMatchObject({ limit: 10, paced: true, paused: false });
  });

  it("should not shrink the pace while the day's new cards are learned", () => {
    const result = deriveSubjectDayLimit({ plan: examPlan, clock: CLOCK, counts: { fresh: 440, waiting: 0 }, usedToday: 10 });

    expect(result.perDay).toBe(10);
  });

  it("should serve no new cards over the pause limit and serve them again below it", () => {
    const paused = deriveSubjectDayLimit({ plan: examPlan, clock: CLOCK, counts: { fresh: 450, waiting: 200 }, usedToday: 0 });
    const resumed = deriveSubjectDayLimit({ plan: examPlan, clock: CLOCK, counts: { fresh: 450, waiting: 199 }, usedToday: 0 });

    expect(paused.limit).toBe(0);
    expect(resumed.limit).toBe(10);
  });

  it("should keep the stored limit and never pause a Long-term subject", () => {
    const result = deriveSubjectDayLimit({
      plan: resolveStudyPlan([], APP),
      clock: CLOCK,
      counts: { fresh: 50, waiting: 9000 },
      usedToday: 0,
    });

    expect(result).toMatchObject({ limit: 20, paused: false });
  });
});
