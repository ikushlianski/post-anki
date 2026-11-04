import { describe, expect, it } from "vitest";
import { deriveRetentionMultiplier } from "@post-anki/core";
import { deriveGradeSchedule, previewGradeIntervals } from "./knowledge-bit-grade-schedule.js";
import { DEFAULT_STEP_OPTIONS } from "./knowledge-bit-learning-steps.js";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const review = (easeFactor: number, intervalDays: number) => ({
  easeFactor,
  intervalDays,
  phase: "review" as const,
  learningStep: 0,
  lapses: 0,
});
const withRetention = (retention: number, maxIntervalDays?: number) => ({
  ...DEFAULT_STEP_OPTIONS,
  retentionMultiplier: deriveRetentionMultiplier(retention),
  maxIntervalDays,
});

describe("grade schedule with retention and exam cap", () => {
  it("should produce identical results to today with default options", () => {
    for (const grade of ["again", "hard", "good", "easy"] as const) {
      expect(deriveGradeSchedule(review(2.5, 10), grade, NOW, { ...DEFAULT_STEP_OPTIONS, retentionMultiplier: 1 })).toEqual(
        deriveGradeSchedule(review(2.5, 10), grade, NOW),
      );
    }
  });

  it("should halve a Good gap at 95% retention", () => {
    const next = deriveGradeSchedule(review(2.5, 20), "good", NOW, withRetention(0.95));

    expect(next.intervalDays).toBe(25);
  });

  it("should still grow a Good gap by at least a day at 95%", () => {
    const next = deriveGradeSchedule(review(1.3, 1), "good", NOW, withRetention(0.95));

    expect(next.intervalDays).toBeGreaterThanOrEqual(2);
  });

  it("should lengthen a Good gap by about half at 85%", () => {
    const next = deriveGradeSchedule(review(2.5, 10), "good", NOW, withRetention(0.85));

    expect(next.intervalDays).toBeCloseTo(38.5, 0);
  });

  it("should cap Easy at the exam cap", () => {
    const next = deriveGradeSchedule(review(2.5, 20), "easy", NOW, withRetention(0.9, 39));

    expect(next.intervalDays).toBe(39);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 39 * DAY_MS);
  });

  it("should cap graduation from learning at a 2-day exam cap", () => {
    const next = deriveGradeSchedule(null, "easy", NOW, withRetention(0.9, 2));

    expect(next.phase).toBe("review");
    expect(next.intervalDays).toBe(2);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 2 * DAY_MS);
  });

  it("should make the preview equal the graded gap under exam options", () => {
    const options = withRetention(0.95, 12);
    const preview = previewGradeIntervals(review(2.5, 10), NOW, options);

    for (const grade of ["again", "hard", "good", "easy"] as const) {
      const next = deriveGradeSchedule(review(2.5, 10), grade, NOW, options);

      expect(preview[grade]).toBe(Math.round((next.dueAt.getTime() - NOW.getTime()) / 1000));
    }
  });
});
