import { describe, expect, it } from "vitest";
import { resolveStudyPlan } from "@post-anki/core";
import { toScheduleOptions } from "./knowledge-bit-schedule-options.js";

const APP = {
  newCardsPerDay: 20,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  desiredRetention: 0.9,
};
const CLOCK = { today: "2026-11-01", timeZone: "UTC" };

describe("toScheduleOptions", () => {
  it("should keep today's limits for a subject nobody has touched", () => {
    const options = toScheduleOptions(resolveStudyPlan([], APP), CLOCK);

    expect(options.maxIntervalDays).toBe(365);
    expect(options.retentionMultiplier).toBe(1);
    expect(options.learningSteps).toEqual([60, 600]);
  });

  it("should limit gaps to the day before the exam for an Exam subject", () => {
    const plan = resolveStudyPlan(
      [{ subjectId: "s", options: {}, studyIntent: "exam", examDate: "2026-11-11", examPlannedAt: null }],
      APP,
    );

    expect(toScheduleOptions(plan, CLOCK).maxIntervalDays).toBe(9);
  });

  it("should shorten gaps for a higher desired retention", () => {
    const plan = resolveStudyPlan(
      [{ subjectId: "s", options: { desiredRetention: 0.95 }, studyIntent: null, examDate: null, examPlannedAt: null }],
      APP,
    );

    expect(toScheduleOptions(plan, CLOCK).retentionMultiplier).toBe(0.5);
  });
});
