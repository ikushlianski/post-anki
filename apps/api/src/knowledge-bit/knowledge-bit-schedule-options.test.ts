import { describe, expect, it } from "vitest";
import { resolveStudyPlan } from "@post-anki/core";
import { previewGradeIntervals } from "./knowledge-bit-grade-schedule.js";
import { toScheduleOptions } from "./knowledge-bit-schedule-options.js";

const APP = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
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

  it("should space a reference card's Good and Easy reviews by level, Easy about twice Cram", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    const reference = { easeFactor: 2.5, intervalDays: 5, phase: "review" as const, learningStep: 0, lapses: 0 };
    const days = (level: "easy" | "normal" | "cram") => {
      const plan = resolveStudyPlan(
        [{ subjectId: "s", options: {}, complexityLevel: level, studyIntent: null, examDate: null, examPlannedAt: null }],
        APP,
      );
      const gaps = previewGradeIntervals(reference, now, toScheduleOptions(plan, CLOCK));

      return { good: gaps.good / 86_400, easy: gaps.easy / 86_400 };
    };

    const rounded = (level: "easy" | "normal" | "cram") => ({
      good: Math.round(days(level).good),
      easy: Math.round(days(level).easy),
    });

    expect(rounded("easy")).toEqual({ good: 17, easy: 21 });
    expect(rounded("normal")).toEqual({ good: 13, easy: 16 });
    expect(rounded("cram")).toEqual({ good: 8, easy: 10 });
    expect(days("easy").good / days("cram").good).toBeCloseTo(2.07, 1);
    expect(days("normal").good).toBeGreaterThan(days("cram").good);
    expect(days("easy").good).toBeGreaterThan(days("normal").good);
  });
});
