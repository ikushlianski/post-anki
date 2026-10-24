import { describe, expect, it } from "vitest";
import { playerLevel } from "./player-level";

describe("playerLevel", () => {
  it("should start everyone at level 1 with 100 points to the next level", () => {
    expect(playerLevel(0)).toEqual({ level: 1, totalPoints: 0, pointsIntoLevel: 0, pointsForNextLevel: 100 });
  });

  it("should switch to level 2 exactly at 100 points", () => {
    expect(playerLevel(99).level).toBe(1);
    expect(playerLevel(100).level).toBe(2);
  });

  it("should switch to level 3 exactly at 300 points", () => {
    expect(playerLevel(299).level).toBe(2);
    expect(playerLevel(300).level).toBe(3);
  });

  it("should report progress inside the current level", () => {
    expect(playerLevel(350)).toEqual({ level: 3, totalPoints: 350, pointsIntoLevel: 50, pointsForNextLevel: 300 });
    expect(playerLevel(600).level).toBe(4);
  });
});
