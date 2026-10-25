import { hasInjectedMarkup } from "./knowledge-bit-source-item-markup-guard.js";
import { cleanLessonExample, type LessonRejection } from "./knowledge-bit-lesson-validation.js";
import { normalizeStatement } from "./knowledge-bit-source-quote.js";
import type {
  LessonDraft,
  SourceItemDraft,
  SourceItemRejection,
} from "./knowledge-bit-source-item-validation.js";

export const FLAGGED_MAX_PER_CHUNK = 3;

export type ReviewFlagReason = SourceItemRejection | LessonRejection;

export interface FlaggedLesson {
  lesson: LessonDraft;
  reason: ReviewFlagReason;
}

const NEVER_KEPT: ReadonlySet<ReviewFlagReason> = new Set(["empty", "unsafe_content"]);

export function isKeepable(reason: ReviewFlagReason): boolean {
  return !NEVER_KEPT.has(reason);
}

export function keepableCards(cards: readonly SourceItemDraft[], sourceText: string): SourceItemDraft[] {
  return cards
    .map((card) => ({
      kind: card.kind,
      statement: card.statement.trim(),
      question: card.question.trim(),
      answer: card.answer.trim(),
      quote: card.quote.trim(),
    }))
    .filter(
      (card) =>
        card.question &&
        card.answer &&
        !hasInjectedMarkup([card.statement, card.question, card.answer], sourceText),
    );
}

export function flagWholeLesson(
  draft: LessonDraft,
  reason: LessonRejection,
  sourceText: string,
): FlaggedLesson | null {
  const statement = draft.statement.trim();
  const cards = keepableCards(draft.cards, sourceText);

  if (!isKeepable(reason) || !statement || hasInjectedMarkup([statement], sourceText) || cards.length === 0) {
    return null;
  }

  return {
    reason,
    lesson: {
      statement,
      quote: draft.quote.trim(),
      example: cleanLessonExample(draft.example, sourceText),
      cards,
    },
  };
}

export function selectFlaggedLessons(
  rejected: readonly FlaggedLesson[],
  existingStatements: ReadonlySet<string>,
  limit: number = FLAGGED_MAX_PER_CHUNK,
): FlaggedLesson[] {
  const seen = new Set(existingStatements);
  const taken: FlaggedLesson[] = [];

  for (const entry of rejected) {
    const key = normalizeStatement(entry.lesson.statement);

    if (taken.length >= limit) {
      break;
    }

    if (!seen.has(key)) {
      seen.add(key);
      taken.push(entry);
    }
  }

  return taken;
}
