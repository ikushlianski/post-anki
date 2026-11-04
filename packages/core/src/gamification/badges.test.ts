import { describe, expect, it } from "vitest";
import { evaluateBadges, type BadgeInput } from "./badges";

const empty: BadgeInput = { longestStreak: 0, masteredCards: 0, totalReviews: 0, subjectReviews: [] };

function byKey(input: BadgeInput) {
  return Object.fromEntries(evaluateBadges(input).map((badge) => [badge.key, badge]));
}

describe("evaluateBadges", () => {
  it("should lock everything for a brand new learner and show no subject badges", () => {
    const badges = evaluateBadges(empty);

    expect(badges).toHaveLength(15);
    expect(badges.every((badge) => !badge.unlocked && badge.progress === 0)).toBe(true);
  });

  it("should unlock a streak badge at its threshold and show progress on the next", () => {
    const badges = byKey({ ...empty, longestStreak: 5 });

    expect(badges["streak-3"]).toMatchObject({ unlocked: true, progress: 3 });
    expect(badges["streak-7"]).toMatchObject({ unlocked: false, progress: 5 });
  });

  it("should unlock mastered badges by card count", () => {
    const unlocked = evaluateBadges({ ...empty, masteredCards: 10 })
      .filter((badge) => badge.unlocked)
      .map((badge) => badge.key);

    expect(unlocked).toEqual(["mastered-1", "mastered-10"]);
  });

  it("should unlock total-reviews badges at 100, 1000 and 5000", () => {
    const badges = byKey({ ...empty, totalReviews: 1000 });

    expect(badges["total-reviews-100"]?.unlocked).toBe(true);
    expect(badges["total-reviews-1000"]?.unlocked).toBe(true);
    expect(badges["total-reviews-5000"]).toMatchObject({ unlocked: false, progress: 1000 });
  });

  it("should give each reviewed subject its own depth badges named after the subject", () => {
    const badges = byKey({
      ...empty,
      subjectReviews: [
        { subjectId: "s1", subjectName: "Biology", reviews: 30 },
        { subjectId: "s2", subjectName: "Law", reviews: 3 },
      ],
    });

    expect(badges["subject-s1-25"]).toMatchObject({
      family: "subject_depth",
      name: "Biology: 25 reviews",
      unlocked: true,
    });
    expect(badges["subject-s1-100"]).toMatchObject({ unlocked: false, progress: 30 });
    expect(badges["subject-s2-25"]).toMatchObject({ unlocked: false, progress: 3 });
  });

  it("should unlock goal-day badges by the number of days the daily goal was met", () => {
    const badges = byKey({ ...empty, goalDays: 20 });

    expect(badges["goal-days-7"]?.unlocked).toBe(true);
    expect(badges["goal-days-20"]).toMatchObject({ family: "goal_days", unlocked: true });
    expect(badges["goal-days-60"]).toMatchObject({ unlocked: false, progress: 20 });
  });

  it("should award solid-subject badges by share of cards solid, ignoring tiny subjects", () => {
    const badges = byKey({
      ...empty,
      subjectSolid: [
        { subjectId: "s1", subjectName: "Biology", totalCards: 40, percent: 55 },
        { subjectId: "s2", subjectName: "Law", totalCards: 2, percent: 100 },
      ],
    });

    expect(badges["subject-solid-s1-50"]).toMatchObject({ family: "subject_solid", name: "Biology: 50% solid", unlocked: true });
    expect(badges["subject-solid-s1-100"]).toMatchObject({ unlocked: false, progress: 55 });
    expect(badges["subject-solid-s2-50"]).toBeUndefined();
  });
});
