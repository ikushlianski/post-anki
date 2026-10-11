const SCRIPT_PATTERNS: readonly RegExp[] = [
  /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/gu,
  /\p{Script=Hangul}/gu,
  /\p{Script=Cyrillic}/gu,
  /\p{Script=Arabic}/gu,
  /\p{Script=Hebrew}/gu,
  /\p{Script=Greek}/gu,
  /\p{Script=Devanagari}/gu,
];
const LETTER = /\p{L}/gu;
const DOMINANT_SHARE = 0.5;

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function looksLikeDifferentScript(sourceText: string, generatedText: string): boolean {
  const generatedLetters = countMatches(generatedText, LETTER);

  if (generatedLetters === 0) {
    return false;
  }

  return SCRIPT_PATTERNS.some(
    (pattern) =>
      countMatches(sourceText, pattern) === 0 &&
      countMatches(generatedText, pattern) > generatedLetters * DOMINANT_SHARE,
  );
}

const LATIN_LETTER = /\p{Script=Latin}/u;
const SOURCE_META_PHRASE = /\b(?:the bit|this item|the text|the source|the author|the passage)\b/i;

export function looksLikeSourceMetaReference(sourceText: string, generatedText: string): boolean {
  const sourceLetters = sourceText.match(LETTER) ?? [];
  const isLatinSource = sourceLetters.every((letter) => LATIN_LETTER.test(letter));

  if (!isLatinSource) {
    return false;
  }

  return SOURCE_META_PHRASE.test(generatedText);
}
