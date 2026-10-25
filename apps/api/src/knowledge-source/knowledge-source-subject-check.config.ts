export const SUBJECT_CHECK_HOURLY_CAP = 30;
export const SUBJECT_CHECK_WINDOW_MS = 60 * 60 * 1000;
export const SUBJECT_CHECK_EMBED_CHARS = 2_000;

const OFF_VALUES = new Set(["false", "0", "off", "no"]);

export function isSubjectCheckEnabled(): boolean {
  const raw = process.env.SUBJECT_CHECK_ENABLED;

  return raw === undefined || !OFF_VALUES.has(raw.trim().toLowerCase());
}
