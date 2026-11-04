const PHRASE_PREFIX = "Phrase: ";
const HINT_PREFIX = "\nHint: ";
const UNSURE_SUFFIX = "\nUnsure: yes";

export interface PhraseSourceText {
  phrase: string;
  hint: string | null;
  unsure: boolean;
}

export function formatPhraseSourceText(phrase: string, hint: string | null, unsure = false): string {
  return `${PHRASE_PREFIX}${phrase}${hint ? `${HINT_PREFIX}${hint}` : ""}${unsure ? UNSURE_SUFFIX : ""}`;
}

export function parsePhraseSourceText(text: string): PhraseSourceText | null {
  if (!text.startsWith(PHRASE_PREFIX)) {
    return null;
  }

  const unsure = text.endsWith(UNSURE_SUFFIX);
  const body = text.slice(PHRASE_PREFIX.length, unsure ? -UNSURE_SUFFIX.length : undefined);
  const hintAt = body.indexOf(HINT_PREFIX);
  const phrase = (hintAt === -1 ? body : body.slice(0, hintAt)).trim();
  const hint = hintAt === -1 ? "" : body.slice(hintAt + HINT_PREFIX.length).trim();

  return phrase ? { phrase, hint: hint || null, unsure } : null;
}
