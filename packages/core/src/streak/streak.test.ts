import { describe, it, expect } from "vitest";
import { updateStreak } from "./streak";

describe("updateStreak", () => {
  it("starts the streak at 1 on the very first activity", () => {
    const result = updateStreak({
      lastActiveDate: null,
      today: "2026-07-14",
      currentStreak: 0,
      longestStreak: 0,
    });

    expect(result).toEqual({ currentStreak: 1, longestStreak: 1, lastActiveDate: "2026-07-14" });
  });

  it("increments the streak when the learner was last active exactly yesterday", () => {
    const result = updateStreak({
      lastActiveDate: "2026-07-13",
      today: "2026-07-14",
      currentStreak: 3,
      longestStreak: 5,
    });

    expect(result).toEqual({ currentStreak: 4, longestStreak: 5, lastActiveDate: "2026-07-14" });
  });

  it("raises longestStreak once currentStreak surpasses it", () => {
    const result = updateStreak({
      lastActiveDate: "2026-07-13",
      today: "2026-07-14",
      currentStreak: 5,
      longestStreak: 5,
    });

    expect(result).toEqual({ currentStreak: 6, longestStreak: 6, lastActiveDate: "2026-07-14" });
  });

  it("is a no-op when activity happens again the same calendar day", () => {
    const result = updateStreak({
      lastActiveDate: "2026-07-14",
      today: "2026-07-14",
      currentStreak: 3,
      longestStreak: 5,
    });

    expect(result).toEqual({ currentStreak: 3, longestStreak: 5, lastActiveDate: "2026-07-14" });
  });

  it("resets currentStreak to 1 (today counts) when a full day was missed", () => {
    const result = updateStreak({
      lastActiveDate: "2026-07-12",
      today: "2026-07-14",
      currentStreak: 4,
      longestStreak: 4,
    });

    expect(result).toEqual({ currentStreak: 1, longestStreak: 4, lastActiveDate: "2026-07-14" });
  });

  it("never reduces longestStreak on a reset", () => {
    const result = updateStreak({
      lastActiveDate: "2026-06-01",
      today: "2026-07-14",
      currentStreak: 10,
      longestStreak: 30,
    });

    expect(result).toEqual({ currentStreak: 1, longestStreak: 30, lastActiveDate: "2026-07-14" });
  });
});
