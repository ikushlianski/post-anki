import { describe, expect, it } from "vitest";
import { deriveGradeSchedule, previewGradeIntervals } from "./knowledge-bit-grade-schedule.js";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("deriveGradeSchedule", () => {
  it("should bring a never-reviewed card back tomorrow after Again, Hard or Good, without touching ease", () => {
    for (const grade of ["again", "hard", "good"] as const) {
      const next = deriveGradeSchedule(null, grade, NOW);

      expect(next.intervalDays).toBe(1);
      expect(next.easeFactor).toBe(2.5);
      expect(next.wasNew).toBe(true);
      expect(next.dueAt.getTime()).toBe(NOW.getTime() + DAY_MS);
    }
  });

  it("should graduate a never-reviewed card straight to four days when the learner presses Easy", () => {
    const next = deriveGradeSchedule(null, "easy", NOW);

    expect(next.intervalDays).toBe(4);
    expect(next.easeFactor).toBe(2.5);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 4 * DAY_MS);
  });

  it("should reset a forgotten card to one day and lower its ease when the learner presses Again", () => {
    const next = deriveGradeSchedule({ easeFactor: 2.5, intervalDays: 30 }, "again", NOW);

    expect(next.intervalDays).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.3, 5);
    expect(next.wasNew).toBe(false);
  });

  it("should grow a hard-recalled card only a little and let it pass the typed mode's 14-day cap", () => {
    const next = deriveGradeSchedule({ easeFactor: 2.5, intervalDays: 100 }, "hard", NOW);

    expect(next.intervalDays).toBeCloseTo(120, 5);
    expect(next.easeFactor).toBeCloseTo(2.35, 5);
  });

  it("should multiply the interval by the card's ease when the learner presses Good", () => {
    const next = deriveGradeSchedule({ easeFactor: 2.5, intervalDays: 10 }, "good", NOW);

    expect(next.intervalDays).toBeCloseTo(25, 5);
    expect(next.easeFactor).toBe(2.5);
  });

  it("should push an easy card further than Good and raise its ease, using the ease from before the grade", () => {
    const next = deriveGradeSchedule({ easeFactor: 2.5, intervalDays: 10 }, "easy", NOW);

    expect(next.intervalDays).toBeCloseTo(32.5, 5);
    expect(next.easeFactor).toBeCloseTo(2.65, 5);
  });

  it("should treat a reviewed card with a zero interval as one day before growing it", () => {
    const next = deriveGradeSchedule({ easeFactor: 2.0, intervalDays: 0 }, "good", NOW);

    expect(next.intervalDays).toBeCloseTo(2, 5);
  });

  it("should never let ease fall below 1.3 or rise above 3.0", () => {
    expect(deriveGradeSchedule({ easeFactor: 1.35, intervalDays: 5 }, "again", NOW).easeFactor).toBe(1.3);
    expect(deriveGradeSchedule({ easeFactor: 2.95, intervalDays: 5 }, "easy", NOW).easeFactor).toBe(3.0);
  });

  it("should never schedule a card more than 180 days out", () => {
    const next = deriveGradeSchedule({ easeFactor: 3.0, intervalDays: 150 }, "easy", NOW);

    expect(next.intervalDays).toBe(180);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 180 * DAY_MS);
  });

  it("should always report the card as in review after a grade", () => {
    expect(deriveGradeSchedule(null, "good", NOW).phase).toBe("review");
    expect(deriveGradeSchedule({ easeFactor: 2.5, intervalDays: 3 }, "hard", NOW).phase).toBe("review");
  });
});

describe("previewGradeIntervals", () => {
  it("should promise a never-reviewed card 1 day for Again, Hard and Good and 4 days for Easy", () => {
    expect(previewGradeIntervals(null, NOW)).toEqual({
      again: 86_400,
      hard: 86_400,
      good: 86_400,
      easy: 4 * 86_400,
    });
  });

  it("should show a reviewed card the interval each grade would really schedule, in seconds", () => {
    expect(previewGradeIntervals({ easeFactor: 2.5, intervalDays: 10 }, NOW)).toEqual({
      again: 86_400,
      hard: 12 * 86_400,
      good: 25 * 86_400,
      easy: 32.5 * 86_400,
    });
  });

  it("should clamp previews to the 180-day maximum like a real grade", () => {
    expect(previewGradeIntervals({ easeFactor: 3.0, intervalDays: 150 }, NOW).easy).toBe(180 * 86_400);
  });
});
