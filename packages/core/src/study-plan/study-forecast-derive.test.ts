import { describe, expect, it } from "vitest";
import { deriveStudyForecast, type StudyForecastStream } from "./study-forecast-derive";

const TODAY = "2026-11-01";

const stream = (patch: Partial<StudyForecastStream> = {}): StudyForecastStream => ({
  scheduled: [],
  newRemaining: 0,
  newUsedToday: 0,
  waitingNow: 0,
  intent: "long_term",
  examDate: null,
  plannedOn: null,
  explicitPerDay: null,
  fallbackPerDay: 20,
  retention: 1,
  ...patch,
});

const run = (patch: Partial<StudyForecastStream>, horizonDays = 10) =>
  deriveStudyForecast({ streams: [stream(patch)], horizonDays, today: TODAY });

describe("deriveStudyForecast", () => {
  it("should count scheduled reviews on their due days and overdue ones today", () => {
    const result = run({
      scheduled: [
        { dueOffset: -3, intervalDays: 60, easeFactor: 2.5 },
        { dueOffset: 0, intervalDays: 60, easeFactor: 2.5 },
        { dueOffset: 4, intervalDays: 60, easeFactor: 2.5 },
      ],
    });

    expect(result.days[0]?.reviews).toBe(2);
    expect(result.days[4]?.reviews).toBe(1);
    expect(result.peakPerDay).toBe(2);
    expect(result.peakOn).toBe(TODAY);
  });

  it("should add new-card follow-up reviews from the next day", () => {
    const result = run({ newRemaining: 5, fallbackPerDay: 5 });

    expect(result.days[0]?.reviews).toBe(0);
    expect(result.days[0]?.newCards).toBe(5);
    expect(result.days[1]?.reviews).toBe(5);
  });

  it("should finish new material on the day the pace runs out", () => {
    const result = run({ newRemaining: 25, fallbackPerDay: 10 });

    expect(result.newFinishOn).toBe("2026-11-03");
  });

  it("should mark a finish on or after the exam as late", () => {
    const late = run({
      intent: "exam",
      examDate: "2026-11-06",
      plannedOn: TODAY,
      newRemaining: 100,
      explicitPerDay: 5,
    });
    const early = run({
      intent: "exam",
      examDate: "2026-11-20",
      plannedOn: TODAY,
      newRemaining: 10,
      explicitPerDay: 5,
    });

    expect(late.finishesBeforeExam).toBe(false);
    expect(early.finishesBeforeExam).toBe(true);
  });

  it("should report no finish date when new cards are zero", () => {
    const result = run({ newRemaining: 10, explicitPerDay: 0 });

    expect(result.newFinishOn).toBeNull();
  });

  it("should skip new cards on simulated days over the pause limit", () => {
    const result = run({
      intent: "exam",
      examDate: "2027-01-01",
      plannedOn: TODAY,
      newRemaining: 50,
      waitingNow: 500,
    });

    expect(result.days[0]?.newCards).toBe(0);
    expect(result.todayPace.paused).toBe(true);
  });

  it("should add more reviews at higher retention", () => {
    const scheduled = Array.from({ length: 20 }, () => ({ dueOffset: 0, intervalDays: 10, easeFactor: 2.5 }));
    const low = run({ scheduled, retention: 0.8 }, 30);
    const high = run({ scheduled, retention: 0.95 }, 30);

    expect(high.averagePerDay).toBeGreaterThan(low.averagePerDay);
  });

  it("should keep every exam review inside the exam window", () => {
    const result = run(
      {
        intent: "exam",
        examDate: "2026-11-06",
        plannedOn: TODAY,
        scheduled: [{ dueOffset: 0, intervalDays: 30, easeFactor: 2.5 }],
      },
      5,
    );

    expect(result.days.reduce((sum, day) => sum + day.reviews, 0)).toBeGreaterThan(1);
  });
});
