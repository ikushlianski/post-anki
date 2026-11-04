const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
export const BLANK = "____";
const KEY_WORD_MIN_CHARS = 4;
const SHORT_KEY_WORD_MIN_CHARS = 3;

export function phraseWords(text: string): string[] {
  return text.match(WORD) ?? [];
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]");
}

function phraseMatcher(words: string[]): RegExp {
  const body = words.map(escapeRegex).join("[^\\p{L}\\p{N}]{1,3}");

  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "giu");
}

export function blankPhrase(sentence: string, phrase: string, visibleWords = 0): string | null {
  const words = phraseWords(phrase);

  if (words.length === 0) {
    return null;
  }

  const matches = [...sentence.matchAll(phraseMatcher(words))];
  const [only] = matches;

  if (matches.length !== 1 || !only || only.index === undefined) {
    return null;
  }

  const visible = Math.min(Math.max(Math.trunc(visibleWords), 0), words.length - 1);
  const matchedWords = [...only[0].matchAll(WORD)];
  const firstHidden = matchedWords[visible];
  const hiddenFrom = only.index + (firstHidden?.index ?? 0);
  const hiddenCount = matchedWords.length - visible;
  const blank = visible === 0 ? BLANK : Array(hiddenCount).fill(BLANK).join(" ");

  return `${sentence.slice(0, hiddenFrom)}${blank}${sentence.slice(only.index + only[0].length)}`;
}

function keyWords(phrase: string): string[] {
  const words = phraseWords(phrase).map((word) => word.toLowerCase());
  const long = words.filter((word) => word.length >= KEY_WORD_MIN_CHARS);

  return long.length > 0 ? long : words.filter((word) => word.length >= SHORT_KEY_WORD_MIN_CHARS);
}

export function revealsPhrase(front: string, phrase: string): boolean {
  const words = phraseWords(phrase);

  if (words.length === 0) {
    return false;
  }

  if (phraseMatcher(words).test(front)) {
    return true;
  }

  const frontWords = phraseWords(front).map((word) => word.toLowerCase());

  return keyWords(phrase).some((key) => frontWords.some((word) => word.startsWith(key)));
}
