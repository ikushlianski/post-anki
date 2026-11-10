import { cleanLessonExample, validateLesson } from "./knowledge-bit-lesson-validation.js";
import {
  flagWholeLesson,
  isKeepable,
  keepableCards,
  type FlaggedLesson,
} from "./knowledge-bit-flagged-lesson.js";
import { normalizeStatement } from "./knowledge-bit-source-quote.js";
import {
  validateSourceItem,
  type SourceItemDraft,
  type SourceItemRejection,
} from "./knowledge-bit-source-item-rules.js";

export {
  SOURCE_ITEM_FILL_BLANK_ANSWER_MAX_CHARS,
  SOURCE_ITEM_KINDS,
  SOURCE_ITEM_QUOTE_MAX_CHARS,
  SOURCE_ITEM_QUOTE_MIN_CHARS,
  SOURCE_ITEM_STATEMENT_MAX_CHARS,
  isQuoteInSource,
  normalizeForQuoteMatch,
  normalizeStatement,
  validateSourceItem,
} from "./knowledge-bit-source-item-rules.js";
export type {
  SourceItemDraft,
  SourceItemDraftKind,
  SourceItemKind,
  SourceItemRejection,
  SourceItemValidation,
} from "./knowledge-bit-source-item-rules.js";

export const LESSONS_MAX_PER_CHUNK = 3;

export interface LessonDraft {
  statement: string;
  quote: string;
  example: string | null;
  cards: SourceItemDraft[];
  aiSuggestion?: string | null;
  reviewFlag?: "non_native_phrase";
  modelIds?: string[];
  webSources?: string[];
}

function carriedFields(draft: LessonDraft): Pick<LessonDraft, "aiSuggestion" | "reviewFlag"> {
  return {
    ...(draft.aiSuggestion === undefined ? {} : { aiSuggestion: draft.aiSuggestion }),
    ...(draft.reviewFlag === undefined ? {} : { reviewFlag: draft.reviewFlag }),
  };
}
export type { FlaggedLesson, ReviewFlagReason } from "./knowledge-bit-flagged-lesson.js";

export interface SourceItemBatchValidation {
  valid: LessonDraft[];
  dropped: SourceItemRejection[];
  rejected: FlaggedLesson[];
}

export function validateSourceItems(
  drafts: readonly LessonDraft[],
  sourceText: string,
  allowMixedScript = false,
): SourceItemBatchValidation {
  const valid: LessonDraft[] = [];
  const dropped: SourceItemRejection[] = [];
  const rejected: FlaggedLesson[] = [];

  for (const draft of drafts) {
    const lesson = validateLesson(draft, sourceText);

    if (!lesson.ok) {
      dropped.push(lesson.reason);

      const flagged = flagWholeLesson(draft, lesson.reason, sourceText);

      if (flagged) {
        rejected.push(flagged);
      }

      continue;
    }

    const cards: SourceItemDraft[] = [];
    const rejectedCards: { card: SourceItemDraft; reason: SourceItemRejection }[] = [];

    for (const card of draft.cards) {
      const result = validateSourceItem({ ...card, quote: lesson.lesson.quote }, sourceText, allowMixedScript);

      if (result.ok) {
        cards.push(result.item);
      } else {
        dropped.push(result.reason);

        if (isKeepable(result.reason)) {
          rejectedCards.push({ card, reason: result.reason });
        }
      }
    }

    const kept = keepableCards(
      rejectedCards.map((entry) => entry.card),
      sourceText,
    );
    const firstReason = rejectedCards[0]?.reason;

    if (firstReason && kept.length > 0) {
      rejected.push({
        reason: firstReason,
        lesson: {
          ...lesson.lesson,
          ...carriedFields(draft),
          example: cleanLessonExample(draft.example, sourceText),
          cards: kept.map((card) => ({ ...card, quote: lesson.lesson.quote })),
        },
      });
    }

    if (cards.length === 0) {
      if (draft.cards.length === 0) {
        dropped.push("empty");
      }

      continue;
    }

    valid.push({
      ...lesson.lesson,
      ...carriedFields(draft),
      example: cleanLessonExample(draft.example, sourceText),
      cards,
    });
  }

  return { valid, dropped, rejected };
}

export function selectNewItems(
  valid: readonly LessonDraft[],
  seenStatements: Set<string>,
  limit: number,
): LessonDraft[] {
  const taken: LessonDraft[] = [];

  for (const lesson of valid) {
    const key = normalizeStatement(lesson.statement);

    if (taken.length >= limit) {
      break;
    }

    if (!seenStatements.has(key)) {
      seenStatements.add(key);
      taken.push(lesson);
    }
  }

  return taken;
}
