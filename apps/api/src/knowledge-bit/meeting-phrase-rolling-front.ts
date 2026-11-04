import { BLANK, blankPhrase, phraseWords } from "./meeting-phrase-blank.js";

const FADE_REVIEWS = 3;

export interface RollingFrontInput {
  kind: string;
  prompt: string;
  answer: string;
  reviewCount: number;
}

export function visibleWordsFor(wordCount: number, reviewCount: number): number {
  if (wordCount < 3) {
    return 0;
  }

  const start = wordCount - 1;
  const remaining = Math.max(FADE_REVIEWS - Math.max(reviewCount, 0), 0);

  return Math.round((start * remaining) / FADE_REVIEWS);
}

function restoreSentence(blanked: string, answer: string): string | null {
  const parts = blanked.split(BLANK);

  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    return null;
  }

  const leading = parts[0] === "" ? `${answer.charAt(0).toUpperCase()}${answer.slice(1)}` : answer;

  return `${parts[0]}${leading}${parts[1]}`;
}

export function rollingPhraseFront(input: RollingFrontInput): string | null {
  const lines = input.prompt.split("\n");
  const [stored, meaning] = lines;

  if (input.kind !== "basic" || lines.length !== 2 || !stored || !meaning) {
    return null;
  }

  const words = phraseWords(input.answer).length;

  if (words < 3) {
    return null;
  }

  const sentence = restoreSentence(stored, input.answer);
  const blanked = sentence ? blankPhrase(sentence, input.answer, visibleWordsFor(words, input.reviewCount)) : null;

  return blanked ? [blanked, meaning].join("\n") : null;
}
