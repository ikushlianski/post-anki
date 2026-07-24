const QUESTIONS_PER_GAP = 1.5;

export function scaleTopicQuizTotal(gapCount: number, floor: number): number {
  const proportional = Math.ceil(gapCount * QUESTIONS_PER_GAP);

  return Math.max(floor, proportional);
}
