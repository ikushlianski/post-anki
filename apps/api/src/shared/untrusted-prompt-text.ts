const PROMPT_TAG_NAMES = [
  "source",
  "bit",
  "question",
  "reference_answer",
  "learner_answer",
  "feedback",
  "kind",
  "verdict",
  "reviewer_feedback",
  "style_notes",
  "session_feedback",
  "rejected_examples",
  "current_notes",
];

const PROMPT_TAG_PATTERN = new RegExp(`<(\\s*/?\\s*(?:${PROMPT_TAG_NAMES.join("|")})(?![\\p{L}\\p{N}_]))`, "giu");

export function escapePromptTags(text: string): string {
  return text.replace(PROMPT_TAG_PATTERN, "<\\$1");
}
