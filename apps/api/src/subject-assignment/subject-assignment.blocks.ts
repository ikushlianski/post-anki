import type { SubjectCheckRequest } from "@post-anki/shared";
import type { SourceAwaitingSubject } from "./subject-assignment.repo.js";
import { SUBJECT_ASSIGNMENT_EXCERPT_CHARS } from "./subject-assignment.config.js";

function excerpt(text: string | null, limit: number): string | null {
  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();

  return collapsed.length === 0 ? null : collapsed.slice(0, limit);
}

export function buildAssignmentBlocks(source: SourceAwaitingSubject): SubjectCheckRequest["blocks"] {
  const text = excerpt(source.rawText, SUBJECT_ASSIGNMENT_EXCERPT_CHARS) ?? excerpt(source.summary, SUBJECT_ASSIGNMENT_EXCERPT_CHARS);
  const cards = excerpt(source.cardBodies.join(" | "), SUBJECT_ASSIGNMENT_EXCERPT_CHARS);

  return [text, cards].flatMap((value) => (value === null ? [] : [{ type: "text" as const, value }]));
}
