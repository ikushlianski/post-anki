import { describe, expect, it } from "vitest";
import { gamificationProfileSchema, reviewPointsSchema } from "./gamification.js";

const validProfile = {
  player: { level: 2, totalPoints: 120, pointsIntoLevel: 20, pointsForNextLevel: 180 },
  todayPoints: 9,
  streak: { current: 4, longest: 7 },
  masteredCards: 12,
  badges: [
    {
      key: "streak-3",
      family: "streak",
      name: "Three in a row",
      description: "Study three days in a row",
      threshold: 3,
      progress: 3,
      unlocked: true,
    },
  ],
};

describe("gamification contracts", () => {
  it("should accept a complete profile as the profile page receives it", () => {
    expect(gamificationProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("should reject negative points so a grade can never subtract from the total", () => {
    const result = reviewPointsSchema.safeParse({
      awarded: -1,
      reason: "awarded",
      totalPoints: 10,
      level: 1,
      leveledUp: false,
    });

    expect(result.success).toBe(false);
  });

  it("should reject an unknown reason so the celebration only shows known outcomes", () => {
    const result = reviewPointsSchema.safeParse({
      awarded: 0,
      reason: "bonus_weekend",
      totalPoints: 10,
      level: 1,
      leveledUp: false,
    });

    expect(result.success).toBe(false);
  });
});
