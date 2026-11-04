export const SUBJECT_CREATION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SUBJECT_CREATION_DEFAULT_DAILY_CAP = 3;
export const SUBJECT_CREATION_EXCERPT_CHARS = 1_500;
export const SUBJECT_CREATION_SUBJECT_CAP = 80;
export const SUBJECT_CREATION_MIN_EDIT_DISTANCE = 3;

const OFF_VALUES = new Set(["false", "0", "off", "no"]);

export function isSubjectAutoCreateEnabled(): boolean {
  const raw = process.env.SUBJECT_AUTO_CREATE_ENABLED;

  return raw === undefined || !OFF_VALUES.has(raw.trim().toLowerCase());
}

export function getSubjectAutoCreateDailyCap(): number {
  const parsed = Number.parseInt(process.env.SUBJECT_AUTO_CREATE_DAILY_CAP ?? "", 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : SUBJECT_CREATION_DEFAULT_DAILY_CAP;
}
