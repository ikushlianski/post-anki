const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;
const OTHER_LETTER = /\p{L}/gu;

export const UNKNOWN_LANGUAGE_LINE = "Write every field in the same language as the source text.";

export type SourceLanguage = "Russian" | "English";

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function detectSourceLanguage(text: string): SourceLanguage | null {
  const cyrillic = countMatches(text, CYRILLIC);
  const latin = countMatches(text, LATIN);
  const letters = countMatches(text, OTHER_LETTER);

  if (letters === 0 || Math.max(cyrillic, latin) * 2 < letters) {
    return null;
  }

  return cyrillic > latin ? "Russian" : "English";
}

export function buildSourceLanguageLine(text: string): string {
  const language = detectSourceLanguage(text);

  if (language === "Russian") {
    return "The source is written in Russian (Cyrillic). Write every field in Russian.";
  }

  if (language === "English") {
    return "The source is written in English. Write every field in English.";
  }

  return UNKNOWN_LANGUAGE_LINE;
}
