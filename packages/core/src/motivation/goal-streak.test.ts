import { describe, expect, it } from "vitest";
import { recordQualifiedDay, viewGoalStreak, type GoalStreakState } from "./goal-streak";

const RULES = { restDaysPerMonth: 2 };

const state = (overrides: Partial<GoalStreakState> = {}): GoalStreakState => ({
  currentStreak: 5,
  longestStreak: 9,
  lastActiveDate: "2026-10-10",
  restDates: [],
  pausedUntil: null,
  lastBrokenStreak: 0,
  ...overrides,
});

describe("recordQualifiedDay", () => {
  it("should start a streak at one on the first qualified day", () => {
    const next = recordQualifiedDay(state({ currentStreak: 0, longestStreak: 0, lastActiveDate: null }), RULES, "2026-10-10");

    expect(next.currentStreak).toBe(1);
  });

  it("should extend the streak on consecutive days", () => {
    expect(recordQualifiedDay(state(), RULES, "2026-10-11").currentStreak).toBe(6);
  });

  it("should not count the same day twice", () => {
    expect(recordQualifiedDay(state(), RULES, "2026-10-10")).toEqual(state());
  });

  it("should absorb one missed day with a rest day and keep the streak", () => {
    const next = recordQualifiedDay(state(), RULES, "2026-10-12");

    expect(next.currentStreak).toBe(6);
    expect(next.restDates).toEqual(["2026-10-11"]);
  });

  it("should absorb two missed days when two rest days are available", () => {
    expect(recordQualifiedDay(state(), RULES, "2026-10-13").currentStreak).toBe(6);
  });

  it("should restart at one but remember the previous streak when rest days run out", () => {
    const next = recordQualifiedDay(state(), RULES, "2026-10-14");

    expect(next.currentStreak).toBe(1);
    expect(next.lastBrokenStreak).toBe(5);
    expect(next.longestStreak).toBe(9);
  });

  it("should not let earlier rest days within the month be reused", () => {
    const next = recordQualifiedDay(state({ restDates: ["2026-10-05", "2026-10-06"] }), RULES, "2026-10-12");

    expect(next.currentStreak).toBe(1);
  });

  it("should give rest days back after thirty days", () => {
    const next = recordQualifiedDay(state({ restDates: ["2026-09-01", "2026-09-02"] }), RULES, "2026-10-12");

    expect(next.currentStreak).toBe(6);
  });

  it("should cover a long absence entirely when the learner paused for it", () => {
    const next = recordQualifiedDay(state({ pausedUntil: "2026-10-19" }), RULES, "2026-10-20");

    expect(next.currentStreak).toBe(6);
    expect(next.restDates).toEqual([]);
  });

  it("should spend rest days only on missed days after the pause ended", () => {
    const next = recordQualifiedDay(state({ pausedUntil: "2026-10-15" }), RULES, "2026-10-18");

    expect(next.currentStreak).toBe(6);
    expect(next.restDates).toEqual(["2026-10-16", "2026-10-17"]);
  });
});

describe("viewGoalStreak", () => {
  it("should show an empty streak before any qualified day", () => {
    expect(viewGoalStreak(state({ currentStreak: 0, lastActiveDate: null }), RULES, "2026-10-10").status).toBe("none");
  });

  it("should show done today when today already qualified", () => {
    expect(viewGoalStreak(state(), RULES, "2026-10-10").status).toBe("done_today");
  });

  it("should show an active streak the day after a qualified day", () => {
    const view = viewGoalStreak(state(), RULES, "2026-10-11");

    expect(view.status).toBe("active");
    expect(view.current).toBe(5);
  });

  it("should keep the streak alive while a rest day covers the gap", () => {
    const view = viewGoalStreak(state(), RULES, "2026-10-12");

    expect(view.status).toBe("resting");
    expect(view.current).toBe(5);
  });

  it("should report paused while a pause covers yesterday", () => {
    expect(viewGoalStreak(state({ pausedUntil: "2026-10-14" }), RULES, "2026-10-15").status).toBe("paused");
  });

  it("should show the best streak and a comeback instead of zero shame when broken", () => {
    const view = viewGoalStreak(state(), RULES, "2026-10-20");

    expect(view).toMatchObject({ status: "broken", current: 0, longest: 9, comeback: true, previousStreak: 5 });
  });

  it("should report rest days left in the rolling month", () => {
    expect(viewGoalStreak(state({ restDates: ["2026-10-05"] }), RULES, "2026-10-10").restDaysLeft).toBe(1);
  });
});
