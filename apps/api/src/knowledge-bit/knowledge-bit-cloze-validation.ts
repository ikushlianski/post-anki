import {
  CLOZE_AI_MAX_NUMBERS,
  CLOZE_AI_STATEMENT_MAX_CHARS,
  parseCloze,
  stripClozeMarkers,
} from "@post-anki/shared";
import { normalizeForQuoteMatch } from "./knowledge-bit-source-quote.js";

const CLOZE_AI_MIN_NUMBERS = 2;

function lettersOnly(text: string): string {
  return normalizeForQuoteMatch(text).replace(/[^\p{L}\p{N}]/gu, "");
}

export function isValidAiCloze(note: string, statement: string, sourceText: string): boolean {
  if (statement.length > CLOZE_AI_STATEMENT_MAX_CHARS) {
    return false;
  }

  const parsed = parseCloze(note);

  if (!parsed.ok) {
    return false;
  }

  const count = parsed.note.numbers.length;

  if (count < CLOZE_AI_MIN_NUMBERS || count > CLOZE_AI_MAX_NUMBERS) {
    return false;
  }

  if (lettersOnly(stripClozeMarkers(parsed.note)) !== lettersOnly(statement)) {
    return false;
  }

  const source = normalizeForQuoteMatch(sourceText);

  return parsed.note.segments.every(
    (segment) => segment.type === "text" || source.includes(normalizeForQuoteMatch(segment.answer)),
  );
}
