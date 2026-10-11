// \p{Pc} catches every underscore-shaped Unicode lookalike; `(?!_)` excludes a real 1-2 char
// ASCII run (max_connections) since only a 3+ run counts as a blank. Extras cover non-Pc lookalikes.
const BLANK_LOOKALIKE_EXTRA_CHARS = "‗‾̲ˍ⎽▁";
const VISIBLE_BLANK_RUN = new RegExp(
  `_{3,}|(?:(?!_)[\\p{Pc}${BLANK_LOOKALIKE_EXTRA_CHARS}])+`,
  "gu",
);
const ALPHANUMERIC = /[\p{L}\p{N}]/u;
const HAS_LETTER = /\p{L}/u;

// Exactly one visible-blank run must exist, be the literal ____ marker, not touch a letter/digit
// on either side, and have real alphabetic text (not just punctuation) around it.
export function isWellFormedFillBlankPrompt(prompt: string): boolean {
  const runs = [...prompt.matchAll(VISIBLE_BLANK_RUN)];

  if (runs.length !== 1) {
    return false;
  }

  const run = runs[0]!;
  const start = run.index;
  const matchedText = run[0];

  if (matchedText !== "____" || start === undefined) {
    return false;
  }

  const before = prompt.slice(0, start);
  const after = prompt.slice(start + matchedText.length);

  if (ALPHANUMERIC.test(before.at(-1) ?? "") || ALPHANUMERIC.test(after.at(0) ?? "")) {
    return false;
  }

  return HAS_LETTER.test(before) || HAS_LETTER.test(after);
}
