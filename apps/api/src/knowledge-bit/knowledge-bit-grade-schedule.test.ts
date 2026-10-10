import { describe, expect, it } from "vitest";
import { deriveGradeSchedule, previewGradeIntervals } from "./knowledge-bit-grade-schedule.js";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const review = (easeFactor: number, intervalDays: number, lapses = 0) => ({
  easeFactor,
  intervalDays,
  phase: "review" as const,
  learningStep: 0,
  lapses,
});

describe("deriveGradeSchedule", () => {
  it("should keep a never-reviewed card in learning for a minute after Again, without touching ease", () => {
    const next = deriveGradeSchedule(null, "again", NOW);

    expect(next).toMatchObject({ phase: "learning", learningStep: 0, intervalDays: 0, easeFactor: 2.5, wasNew: true });
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 60_000);
  });

  it("should graduate a never-reviewed card straight to four days when the learner presses Easy", () => {
    const next = deriveGradeSchedule(null, "easy", NOW);

    expect(next).toMatchObject({ phase: "review", intervalDays: 4, easeFactor: 2.5 });
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 4 * DAY_MS);
  });

  it("should graduate a card to one day after Good on its last learning step", () => {
    const next = deriveGradeSchedule(
      { easeFactor: 2.5, intervalDays: 0, phase: "learning", learningStep: 1, lapses: 0 },
      "good",
      NOW,
    );

    expect(next).toMatchObject({ phase: "review", intervalDays: 1, wasNew: false });
  });

  it("should send a forgotten card to a 10-minute relearning step, count the lapse and lower its ease", () => {
    const next = deriveGradeSchedule(review(2.5, 30), "again", NOW);

    expect(next).toMatchObject({ phase: "relearning", intervalDays: 1, lapses: 1, wasNew: false });
    expect(next.easeFactor).toBeCloseTo(2.3, 5);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 600_000);
  });

  it("should grow a hard-recalled card only a little and let it pass the typed mode's 14-day cap", () => {
    const next = deriveGradeSchedule(review(2.5, 100), "hard", NOW);

    expect(next.intervalDays).toBeCloseTo(120, 5);
    expect(next.easeFactor).toBeCloseTo(2.35, 5);
  });

  it("should multiply the interval by the card's ease when the learner presses Good", () => {
    const next = deriveGradeSchedule(review(2.5, 10), "good", NOW);

    expect(next.intervalDays).toBeCloseTo(25, 5);
    expect(next.easeFactor).toBe(2.5);
  });

  it("should push an easy card further than Good and raise its ease, using the ease from before the grade", () => {
    const next = deriveGradeSchedule(review(2.5, 10), "easy", NOW);

    expect(next.intervalDays).toBeCloseTo(32.5, 5);
    expect(next.easeFactor).toBeCloseTo(2.65, 5);
  });

  it("should treat a reviewed card with a zero interval as one day before growing it", () => {
    const next = deriveGradeSchedule(review(2.0, 0), "good", NOW);

    expect(next.intervalDays).toBeCloseTo(2, 5);
  });

  it("should never let ease fall below 1.3 or rise above 3.0", () => {
    expect(deriveGradeSchedule(review(1.35, 5), "again", NOW).easeFactor).toBe(1.3);
    expect(deriveGradeSchedule(review(2.95, 5), "easy", NOW).easeFactor).toBe(3.0);
  });

  it("should never schedule a card more than 180 days out", () => {
    const next = deriveGradeSchedule(review(3.0, 150), "easy", NOW);

    expect(next.intervalDays).toBe(180);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 180 * DAY_MS);
  });

  it("should keep reviewed cards in review after Hard, Good and Easy", () => {
    for (const grade of ["hard", "good", "easy"] as const) {
      expect(deriveGradeSchedule(review(2.5, 3), grade, NOW).phase).toBe("review");
    }
  });
});

describe("previewGradeIntervals", () => {
  it("should promise a never-reviewed card 1 minute, 5.5 minutes, 10 minutes and 4 days", () => {
    expect(previewGradeIntervals(null, NOW)).toEqual({ again: 60, hard: 330, good: 600, easy: 4 * 86_400 });
  });

  it("should show a reviewed card the interval each grade would really schedule, in seconds", () => {
    expect(previewGradeIntervals(review(2.5, 10), NOW)).toEqual({
      again: 600,
      hard: 12 * 86_400,
      good: 25 * 86_400,
      easy: 32.5 * 86_400,
    });
  });

  it("should clamp previews to the 180-day maximum like a real grade", () => {
    expect(previewGradeIntervals(review(3.0, 150), NOW).easy).toBe(180 * 86_400);
  });
});
