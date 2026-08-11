export function sessionElapsedMinutes(startedAt: string | null, endedAt: string): number {
  if (!startedAt) {
    return 0;
  }

  const elapsedMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

  return Math.max(0, Math.floor(elapsedMs / 60_000));
}
