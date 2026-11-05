export const SPLIT_MIN_CHARS = 8_000;
export const SPLIT_MAX_SOURCES = 12;
export const SPLIT_MIN_PART_CHARS = 1_000;
export const SPLIT_HOURLY_CAP = 20;
export const SPLIT_WINDOW_MS = 60 * 60 * 1000;
export const SPLIT_TIMEOUT_MS = 20_000;

const OFF_VALUES = new Set(["false", "0", "off", "no"]);

export function isLongPasteSplitEnabled(): boolean {
  const raw = process.env.LONG_PASTE_SPLIT_ENABLED;

  return raw === undefined || !OFF_VALUES.has(raw.trim().toLowerCase());
}
