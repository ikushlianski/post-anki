const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function formatWaitDuration(since: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - since.getTime());

  if (elapsed >= DAY_MS) {
    return `${Math.floor(elapsed / DAY_MS)}d`;
  }

  if (elapsed >= HOUR_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h`;
  }

  return `${Math.floor(elapsed / MINUTE_MS)}m`;
}
