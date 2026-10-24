import {
  SUBJECT_SUGGESTION_MAX_NAME_LENGTH,
  SUBJECT_SUGGESTION_MIN_NAME_LENGTH,
  SUBJECT_SUGGESTION_SAMPLE_MAX_CHARS,
} from "./subject-suggestion.config.js";

const FORBIDDEN_CHARS = /[\r\n\u2028\u2029<>]/;
const REASON_MAX_CHARS = 300;

export function sanitizeProposedName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").trim();

  if (
    name.length < SUBJECT_SUGGESTION_MIN_NAME_LENGTH ||
    name.length > SUBJECT_SUGGESTION_MAX_NAME_LENGTH ||
    FORBIDDEN_CHARS.test(name)
  ) {
    return null;
  }

  return name;
}

export function sanitizeReason(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, REASON_MAX_CHARS);
}

export function toEvidenceSample(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, SUBJECT_SUGGESTION_SAMPLE_MAX_CHARS);
}
