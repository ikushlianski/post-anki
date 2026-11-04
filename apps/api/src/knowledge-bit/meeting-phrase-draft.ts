import { NON_NATIVE_PHRASE_FLAG } from "@post-anki/shared";
import type { PhraseSourceText } from "../knowledge-source/phrase-source-text.js";
import { BASIC_CARD_FRONT_MAX_CHARS } from "./knowledge-bit-basic-card-validation.js";
import { blankPhrase, phraseWords, revealsPhrase } from "./meeting-phrase-blank.js";
import { SOURCE_ITEM_QUOTE_MAX_CHARS } from "./knowledge-bit-source-quote.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

export interface PhraseSentence {
  text: string;
  meaning: string;
}

export interface MeetingPhraseAgentOutput {
  context: string;
  looksNonNative: boolean;
  suggestion: string;
  chunk?: string;
  sentences?: PhraseSentence[];
  russianMeaning?: string;
  russianAlt?: string;
  simpleExplanation?: string;
  situation?: string;
}

export interface PickedSentence {
  sentence: string;
  chunk: string;
  meaning: string;
  blanked: string;
}

const MAX_SENTENCES = 3;

function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usableSuggestion(source: PhraseSourceText, output: MeetingPhraseAgentOutput): string | null {
  const suggestion = output.suggestion.trim();

  if (suggestion === "" || comparable(suggestion) === comparable(source.phrase.trim())) {
    return null;
  }

  return suggestion;
}

function targetPhrase(source: PhraseSourceText, output: MeetingPhraseAgentOutput): string {
  const suggestion = output.looksNonNative || source.unsure ? usableSuggestion(source, output) : null;

  return suggestion ?? source.phrase.trim();
}

const MAX_CHUNK_WORDS = 4;

export function chunkOf(source: PhraseSourceText, output: MeetingPhraseAgentOutput): string {
  const target = targetPhrase(source, output);
  const chunk = output.chunk?.trim() ?? "";
  const words = phraseWords(chunk);
  const inTarget = words.length > 0 && comparable(` ${target} `).includes(` ${comparable(chunk)} `);

  return inTarget && words.length <= MAX_CHUNK_WORDS ? chunk : target;
}

function frontOf(sentence: PickedSentence): string {
  return [sentence.blanked, sentence.meaning].join("\n");
}

export function pickSentences(
  source: PhraseSourceText,
  output: MeetingPhraseAgentOutput,
): PickedSentence[] | null {
  const chunk = chunkOf(source, output);
  const kept: PickedSentence[] = [];

  for (const raw of output.sentences ?? []) {
    const sentence = raw.text.trim();
    const meaning = raw.meaning.trim();
    const blanked = meaning === "" ? null : blankPhrase(sentence, chunk);
    const isNew = !kept.some((existing) => comparable(existing.sentence) === comparable(sentence));

    if (blanked && isNew) {
      const picked = { sentence, chunk, meaning, blanked };

      if (frontOf(picked).length <= BASIC_CARD_FRONT_MAX_CHARS) {
        kept.push(picked);
      }
    }
  }

  return kept.length === 0 ? null : kept.slice(0, MAX_SENTENCES);
}

function alternativeFronts(output: MeetingPhraseAgentOutput, target: string): string[] {
  const seen = new Set<string>();

  return [output.situation, output.russianMeaning, output.russianAlt, output.simpleExplanation].flatMap((raw) => {
    const front = raw?.trim() ?? "";
    const key = comparable(front);

    if (front === "" || seen.has(key) || revealsPhrase(front, target)) {
      return [];
    }

    seen.add(key);

    return [front];
  });
}

export function buildPhraseLesson(
  source: PhraseSourceText,
  output: MeetingPhraseAgentOutput,
  chunk: string,
  sentences: PickedSentence[] | null = null,
): LessonDraft {
  const phrase = source.phrase.trim();
  const suggestion = output.suggestion.trim();
  const sameAsPhrase = suggestion !== "" && comparable(suggestion) === comparable(phrase);
  const hasBetterVersion = suggestion !== "" && !sameAsPhrase;
  const flagged = source.unsure || (output.looksNonNative && hasBetterVersion);
  const context = output.context.trim();
  const quote = chunk.trim().slice(0, SOURCE_ITEM_QUOTE_MAX_CHARS);
  const target = targetPhrase(source, output);
  const core = chunkOf(source, output);
  const withContext = context ? { context } : {};
  const sentenceCards = (sentences ?? []).map((sentence) => ({
    kind: "basic" as const,
    statement: phrase,
    question: frontOf(sentence),
    ...withContext,
    answer: sentence.chunk,
    quote,
  }));
  const frontCards = alternativeFronts(output, target).map((front) => ({
    kind: "basic" as const,
    statement: phrase,
    question: front,
    ...withContext,
    answer: sentences ? core : phrase,
    quote,
  }));

  return {
    statement: phrase,
    quote,
    example: null,
    cards: [...sentenceCards, ...frontCards],
    aiSuggestion: flagged && hasBetterVersion ? suggestion : null,
    ...(flagged ? { reviewFlag: NON_NATIVE_PHRASE_FLAG as "non_native_phrase" } : {}),
  };
}
