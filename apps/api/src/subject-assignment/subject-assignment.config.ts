export const SUBJECT_ASSIGNMENT_SOURCE_CAP = 10;
export const SUBJECT_ASSIGNMENT_EXCERPT_CHARS = 1_500;
export const SUBJECT_ASSIGNMENT_CARD_SAMPLE_COUNT = 4;
export const SUBJECT_ASSIGNMENT_ESCALATION_EXCERPT_CHARS = 600;
export const SUBJECT_ASSIGNMENT_ESCALATION_SUBJECT_CAP = 80;

const OFF_VALUES = new Set(["false", "0", "off", "no"]);

export function isSubjectAssignmentEnabled(): boolean {
  const raw = process.env.SUBJECT_ASSIGNMENT_ENABLED;

  return raw === undefined || !OFF_VALUES.has(raw.trim().toLowerCase());
}
