import type { PlayerLevel } from "@post-anki/shared";

const LEVEL_STEP = 50;

export function pointsToReachLevel(level: number): number {
  return LEVEL_STEP * (level - 1) * level;
}

export function playerLevel(totalPoints: number): PlayerLevel {
  const total = Math.max(0, Math.floor(totalPoints));
  let level = 1;

  while (pointsToReachLevel(level + 1) <= total) {
    level += 1;
  }

  const floor = pointsToReachLevel(level);

  return {
    level,
    totalPoints: total,
    pointsIntoLevel: total - floor,
    pointsForNextLevel: pointsToReachLevel(level + 1) - floor,
  };
}
