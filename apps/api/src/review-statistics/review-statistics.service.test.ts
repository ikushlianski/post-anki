import { describe, expect, it, vi } from "vitest";

vi.mock("./review-statistics-forecast.repo.js", () => ({
  readDueForecast: vi.fn(async () => ({ today: "2026-03-30", overdue: 2, dayCounts: [{ offset: 3, count: 4 }] })),
  readLocalToday: vi.fn(async () => "2026-03-30"),
}));
vi.mock("./review-statistics-history.repo.js", () => ({
  readReviewHistory: vi.fn(async () => ({
    retention: [
      { date: "2026-03-29", total: 4, passed: 3 },
      { date: "2026-03-30", total: 0, passed: 0 },
    ],
    gradeCounts: [{ grade: "good", count: 5 }],
    earliestReviewDate: "2026-01-02",
  })),
}));
vi.mock("./review-statistics-subject-scope.js", () => ({
  resolveSubjectScope: vi.fn(async () => ({ subjectIds: undefined, empty: false })),
}));

const { addLocalDays, getReviewStatistics, pickGranularity } = await import("./review-statistics.service.js");

const QUERY = { tz: "UTC", forecastDays: 7, historyDays: 90 } as const;

describe("pickGranularity", () => {
  it("should switch to weekly buckets for long windows and all time", () => {
    expect(pickGranularity(30)).toBe("day");
    expect(pickGranularity(90)).toBe("day");
    expect(pickGranularity(365)).toBe("week");
    expect(pickGranularity(0)).toBe("week");
  });
});

describe("addLocalDays", () => {
  it("should roll over month boundaries without shifting the date", () => {
    expect(addLocalDays("2026-03-30", 3)).toBe("2026-04-02");
  });
});

describe("getReviewStatistics", () => {
  it("should fill days with no due cards as zero so the chart has no gaps", async () => {
    const stats = await getReviewStatistics(QUERY, new Date("2026-03-30T10:00:00Z"));

    expect(stats.forecast.days.map((day) => day.count)).toEqual([0, 0, 0, 4, 0, 0, 0]);
    expect(stats.forecast.days[6]?.date).toBe("2026-04-05");
    expect(stats.forecast.overdue).toBe(2);
  });

  it("should return a null rate, not 0%, for a bucket with no review-phase answers", async () => {
    const stats = await getReviewStatistics(QUERY, new Date("2026-03-30T10:00:00Z"));

    expect(stats.retention.points.map((point) => point.rate)).toEqual([0.75, null]);
    expect(stats.retention.overallRate).toBe(0.75);
  });

  it("should report all four grades with zeros and the total", async () => {
    const stats = await getReviewStatistics(QUERY, new Date("2026-03-30T10:00:00Z"));

    expect(stats.answerButtons).toEqual({ total: 5, counts: { again: 0, hard: 0, good: 5, easy: 0 } });
  });
});
