import type { NotionSourceFrequency } from "@post-anki/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const NIGHTLY_HOUR_UTC = 1;

export function computeNextRunAt(frequency: NotionSourceFrequency, now: Date): Date | null {
  if (frequency === "manual") {
    return null;
  }

  if (frequency === "daily") {
    return new Date(now.getTime() + DAY_MS);
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), NIGHTLY_HOUR_UTC);

  return new Date(today > now.getTime() ? today : today + DAY_MS);
}
