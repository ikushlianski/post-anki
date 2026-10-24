import { hasInjectedMarkup } from "./knowledge-bit-source-item-markup-guard.js";
import {
  hasForeignScriptRun,
  looksLikeDifferentScript,
  looksLikeSourceMetaReference,
} from "./knowledge-bit-language-guard.js";
import {
  SOURCE_ITEM_QUOTE_MAX_CHARS,
  SOURCE_ITEM_QUOTE_MIN_CHARS,
  SOURCE_ITEM_STATEMENT_MAX_CHARS,
  isQuoteInSource,
} from "./knowledge-bit-source-quote.js";

export const LESSON_EXAMPLE_MAX_CHARS = 200;

export type LessonRejection =
  | "empty"
  | "too_long"
  | "quote_length"
  | "quote_not_in_source"
  | "wrong_language"
  | "source_meta_reference"
  | "unsafe_content";

export interface LessonCore {
  statement: string;
  quote: string;
}

export type LessonValidation =
  | { ok: true; lesson: LessonCore }
  | { ok: false; reason: LessonRejection };

export function validateLesson(raw: LessonCore, sourceText: string): LessonValidation {
  const lesson: LessonCore = { statement: raw.statement.trim(), quote: raw.quote.trim() };

  if (!lesson.statement || !lesson.quote) {
    return { ok: false, reason: "empty" };
  }

  if (lesson.statement.length > SOURCE_ITEM_STATEMENT_MAX_CHARS) {
    return { ok: false, reason: "too_long" };
  }

  if (lesson.quote.length < SOURCE_ITEM_QUOTE_MIN_CHARS || lesson.quote.length > SOURCE_ITEM_QUOTE_MAX_CHARS) {
    return { ok: false, reason: "quote_length" };
  }

  if (!isQuoteInSource(lesson.quote, sourceText)) {
    return { ok: false, reason: "quote_not_in_source" };
  }

  if (hasInjectedMarkup([lesson.statement], sourceText)) {
    return { ok: false, reason: "unsafe_content" };
  }

  if (looksLikeDifferentScript(sourceText, lesson.statement) || hasForeignScriptRun(sourceText, lesson.statement)) {
    return { ok: false, reason: "wrong_language" };
  }

  if (looksLikeSourceMetaReference(sourceText, lesson.statement)) {
    return { ok: false, reason: "source_meta_reference" };
  }

  return { ok: true, lesson };
}

export function cleanLessonExample(example: string | null | undefined, sourceText: string): string | null {
  const trimmed = example?.trim();

  if (!trimmed || trimmed.length > LESSON_EXAMPLE_MAX_CHARS) {
    return null;
  }

  return hasInjectedMarkup([trimmed], sourceText) ? null : trimmed;
}
