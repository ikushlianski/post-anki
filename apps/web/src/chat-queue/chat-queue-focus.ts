export function moveFocusIndex(
  current: number,
  delta: 1 | -1,
  count: number,
): number {
  if (count <= 0) return -1;

  if (current < 0) return delta === 1 ? 0 : count - 1;

  return Math.min(count - 1, Math.max(0, current + delta));
}

export function clampFocusIndex(current: number, count: number): number {
  if (count <= 0) return -1;

  return Math.min(current, count - 1);
}
