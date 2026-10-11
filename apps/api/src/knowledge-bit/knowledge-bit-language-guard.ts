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
const CYRILLIC_LETTER = /\p{Script=Cyrillic}/u;
const SOURCE_META_PHRASE = /\b(?:the bit|this item|the text|the source|the author|the passage)\b/i;
const CYRILLIC_META_PHRASE =
  /(?<![\p{L}\p{N}])(?:(?:в|из|по|согласно|судя\s+по|как\s+сказано\s+в)\s+(?:данн\p{L}+\s+|этом\s+|этого\s+|указанн\p{L}+\s+)?(?:текст\p{L}*|источник\p{L}*|отрывк\p{L}*|фрагмент\p{L}*)|(?:данн\p{L}+|этот|этого|этому|этим|исходн\p{L}+)\s+(?:текст\p{L}*|источник\p{L}*|отрывок|отрывк\p{L}*|фрагмент\p{L}*)|автор(?:а|у|ом|е|ы|ов|ам|ами|ах)?|эт(?:от|ого|ому|им|ом)\s+элемент\p{L}*)(?![\p{L}\p{N}])/iu;

export function looksLikeSourceMetaReference(sourceText: string, generatedText: string): boolean {
  const sourceLetters = sourceText.match(LETTER) ?? [];

  if (sourceLetters.some((letter) => CYRILLIC_LETTER.test(letter))) {
    return CYRILLIC_META_PHRASE.test(generatedText);
  }

  const isLatinSource = sourceLetters.every((letter) => LATIN_LETTER.test(letter));

  if (!isLatinSource) {
    return false;
  }

  return SOURCE_META_PHRASE.test(generatedText);
}
