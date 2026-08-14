const QUESTIONS_PER_GAP = 1.5;

export function scaleTopicQuizTotal(
  gapCount: number,
  floor: number,
  ceiling: number,
): number {
  const proportional = Math.ceil(gapCount * QUESTIONS_PER_GAP);

  // Ceiling applied BEFORE floor, deliberately: if a caller ever passes
  // ceiling < floor, Math.min(ceiling, proportional) <= ceiling < floor, and
  // the outer Math.max still recovers `floor` — the function can never
  // return below its own floor no matter how the two bounds are misused.
  return Math.max(floor, Math.min(ceiling, proportional));
}
