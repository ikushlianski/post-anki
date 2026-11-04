import { isWellFormedFillBlankPrompt } from "./knowledge-bit-fill-blank-prompt-validation.js";
import { BASIC_CARD_FRONT_MAX_CHARS, validateBasicCard } from "./knowledge-bit-basic-card-validation.js";
import { isValidAiCloze } from "./knowledge-bit-cloze-validation.js";
import { isValidAiOrderedList } from "./knowledge-bit-ordered-list-validation.js";
import { hasInjectedMarkup } from "./knowledge-bit-source-item-markup-guard.js";
import { isYesNoQuestion } from "./knowledge-bit-yes-no-question.js";
import {
  SOURCE_ITEM_QUOTE_MAX_CHARS,
  SOURCE_ITEM_QUOTE_MIN_CHARS,
  SOURCE_ITEM_STATEMENT_MAX_CHARS,
  isQuoteInSource,
  isQuoteLengthValid,
  normalizeForQuoteMatch,
  normalizeStatement,
} from "./knowledge-bit-source-quote.js";
import {
  hasForeignScriptRun,
  looksLikeDifferentScript,
  looksLikeSourceMetaReference,
} from "./knowledge-bit-language-guard.js";

export const SOURCE_ITEM_KINDS = ["basic", "why", "fill_blank"] as const;

export type SourceItemKind = (typeof SOURCE_ITEM_KINDS)[number];

export type SourceItemDraftKind = SourceItemKind | "cloze" | "ordered_list";

export interface SourceItemDraft {
  statement: string;
  question: string;
  context?: string | null;
  answer: string;
  kind: SourceItemDraftKind;
  quote: string;
}

export {
  SOURCE_ITEM_QUOTE_MAX_CHARS,
  SOURCE_ITEM_QUOTE_MIN_CHARS,
  SOURCE_ITEM_STATEMENT_MAX_CHARS,
  isQuoteInSource,
  normalizeForQuoteMatch,
  normalizeStatement,
};

export const SOURCE_ITEM_FILL_BLANK_ANSWER_MAX_CHARS = 120;

export type SourceItemRejection =
  | "empty"
  | "too_long"
  | "quote_length"
  | "quote_not_in_source"
  | "wrong_language"
  | "source_meta_reference"
  | "bad_card"
  | "unsafe_content"
  | "bad_blank"
  | "answer_not_in_statement";

export type SourceItemValidation =
  | { ok: true; item: SourceItemDraft }
  | { ok: false; reason: SourceItemRejection };

function lettersOnly(text: string): string {
  return normalizeForQuoteMatch(text).replace(/[^\p{L}\p{N}]/gu, "");
}

function validateFillBlank(item: SourceItemDraft): SourceItemRejection | null {
  if (item.question.length > BASIC_CARD_FRONT_MAX_CHARS) {
    return "too_long";
  }

  if (!isWellFormedFillBlankPrompt(item.question)) {
    return "bad_blank";
  }

  if (item.answer.length > SOURCE_ITEM_FILL_BLANK_ANSWER_MAX_CHARS || item.answer.includes("____")) {
    return "bad_blank";
  }

  if (!normalizeForQuoteMatch(item.statement).includes(normalizeForQuoteMatch(item.answer))) {
    return "answer_not_in_statement";
  }

  if (lettersOnly(item.question.replace("____", () => item.answer)) !== lettersOnly(item.statement)) {
    return "bad_blank";
  }

  return null;
}

function blankOutAnswer(item: SourceItemDraft): SourceItemDraft | null {
  const answer = item.answer.replace(/[.!]+$/u, "").trim();
  const parts = answer ? item.statement.split(answer) : [];

  if (parts.length !== 2) {
    return null;
  }

  const repaired = { ...item, answer, question: `${parts[0]}____${parts[1]}` };

  return validateFillBlank(repaired) === null ? repaired : null;
}

function validateCard(item: SourceItemDraft, sourceText: string, allowMixedScript: boolean): SourceItemRejection | null {
  if (isYesNoQuestion(item.question, item.answer)) {
    return "bad_card";
  }

  const card = validateBasicCard({ front: item.question, back: item.answer }, sourceText, allowMixedScript);

  if (card.ok) {
    return null;
  }

  if (card.reason === "empty") {
    return "empty";
  }

  if (card.reason === "too_long") {
    return "too_long";
  }

  if (card.reason === "wrong_language") {
    return "wrong_language";
  }

  if (card.reason === "source_meta_reference") {
    return "source_meta_reference";
  }

  return "bad_card";
}

export function validateSourceItem(
  raw: SourceItemDraft,
  sourceText: string,
  allowMixedScript = false,
): SourceItemValidation {
  const item: SourceItemDraft = {
    kind: raw.kind,
    statement: raw.statement.trim(),
    question: raw.question.trim(),
    ...(raw.context?.trim() ? { context: raw.context.trim() } : {}),
    answer: raw.answer.trim(),
    quote: raw.quote.trim(),
  };

  if (!item.statement || !item.question || !item.answer || !item.quote) {
    return { ok: false, reason: "empty" };
  }

  if (item.statement.length > SOURCE_ITEM_STATEMENT_MAX_CHARS) {
    return { ok: false, reason: "too_long" };
  }

  if (!isQuoteLengthValid(item.quote, sourceText)) {
    return { ok: false, reason: "quote_length" };
  }

  if (!isQuoteInSource(item.quote, sourceText)) {
    return { ok: false, reason: "quote_not_in_source" };
  }

  const texts = [item.statement, item.question, item.answer];

  if (hasInjectedMarkup(texts, sourceText)) {
    return { ok: false, reason: "unsafe_content" };
  }

  if (!allowMixedScript && texts.some((text) => looksLikeDifferentScript(sourceText, text) || hasForeignScriptRun(sourceText, text))) {
    return { ok: false, reason: "wrong_language" };
  }

  if (texts.some((text) => looksLikeSourceMetaReference(sourceText, text))) {
    return { ok: false, reason: "source_meta_reference" };
  }

  if (item.kind === "cloze") {
    return isValidAiCloze(item.question, item.statement, sourceText)
      ? { ok: true, item }
      : { ok: false, reason: "bad_blank" };
  }

  if (item.kind === "ordered_list") {
    return isValidAiOrderedList(item.question, sourceText)
      ? { ok: true, item }
      : { ok: false, reason: "bad_card" };
  }

  if (item.kind !== "fill_blank") {
    const cardRejection = validateCard(item, sourceText, allowMixedScript);

    return cardRejection ? { ok: false, reason: cardRejection } : { ok: true, item };
  }

  const blankRejection = validateFillBlank(item);

  if (!blankRejection) {
    return { ok: true, item };
  }

  if (blankRejection === "too_long") {
    return { ok: false, reason: blankRejection };
  }

  const repaired = blankOutAnswer(item);

  if (repaired) {
    return { ok: true, item: repaired };
  }

  if (item.question.includes("____")) {
    return { ok: false, reason: blankRejection };
  }

  const asBasic: SourceItemDraft = { ...item, kind: "basic" };

  return validateCard(asBasic, sourceText, allowMixedScript) ? { ok: false, reason: blankRejection } : { ok: true, item: asBasic };
}
