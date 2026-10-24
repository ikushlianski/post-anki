import { isQuoteInSource } from "./knowledge-bit-source-quote.js";
import { LESSONS_MAX_PER_CHUNK, type LessonDraft } from "./knowledge-bit-source-item-validation.js";

export const EVAL_MAX_CARDS = LESSONS_MAX_PER_CHUNK * 2;

const FIRST_PERSON =
  /(?<![\p{L}])(я|мне|меня|мной|мною|мой|моя|моё|мое|мои|моих|моим|моему|мы|нас|нам|нами|наш|наша|наше|наши|нашего|i|my|me|we|our|us)(?![\p{L}])/iu;

export interface LessonEvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

function textsOf(lesson: LessonDraft): string[] {
  return [lesson.statement, ...lesson.cards.flatMap((card) => [card.statement, card.question, card.answer])];
}

export function findFirstPersonWord(text: string): string | null {
  return FIRST_PERSON.exec(text)?.[0] ?? null;
}

export function checkLessons(lessons: readonly LessonDraft[], sourceText: string): LessonEvalCheck[] {
  const cardCount = lessons.reduce((sum, lesson) => sum + lesson.cards.length, 0);
  const firstPerson = lessons
    .flatMap(textsOf)
    .map(findFirstPersonWord)
    .filter((word): word is string => word !== null);
  const badQuotes = lessons.filter((lesson) => !isQuoteInSource(lesson.quote, sourceText));

  return [
    {
      name: "lesson count",
      passed: lessons.length >= 1 && lessons.length <= LESSONS_MAX_PER_CHUNK,
      detail: `${lessons.length} lessons (max ${LESSONS_MAX_PER_CHUNK})`,
    },
    {
      name: "card count",
      passed: cardCount >= 1 && cardCount <= EVAL_MAX_CARDS,
      detail: `${cardCount} cards (max ${EVAL_MAX_CARDS})`,
    },
    {
      name: "no first person",
      passed: firstPerson.length === 0,
      detail: firstPerson.length === 0 ? "none found" : `found: ${firstPerson.join(", ")}`,
    },
    {
      name: "quotes in source",
      passed: badQuotes.length === 0,
      detail: `${lessons.length - badQuotes.length} of ${lessons.length} quotes found verbatim`,
    },
  ];
}
