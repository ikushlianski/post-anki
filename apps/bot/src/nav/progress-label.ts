export function formatProgressLabel(percent: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round(clamped / 20);
  const empty = 5 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  return `${bar} ${clamped}%`;
}
