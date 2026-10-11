import { isWellFormedFillBlankPrompt } from "./knowledge-bit-fill-blank-prompt-validation.js";
import { BASIC_CARD_FRONT_MAX_CHARS, validateBasicCard } from "./knowledge-bit-basic-card-validation.js";
import { isYesNoQuestion } from "./knowledge-bit-yes-no-question.js";
import {
  hasForeignScriptRun,
  looksLikeDifferentScript,
  looksLikeSourceMetaReference,
} from "./knowledge-bit-language-guard.js";

export const SOURCE_ITEM_KINDS = ["basic", "why", "fill_blank"] as const;

export type SourceItemKind = (typeof SOURCE_ITEM_KINDS)[number];

export interface SourceItemDraft {
  statement: string;
  question: string;
  answer: string;
  kind: SourceItemKind;
  quote: string;
}

export const SOURCE_ITEM_QUOTE_MIN_CHARS = 12;
export const SOURCE_ITEM_QUOTE_MAX_CHARS = 300;
export const SOURCE_ITEM_STATEMENT_MAX_CHARS = 600;
export const SOURCE_ITEM_FILL_BLANK_ANSWER_MAX_CHARS = 120;

export type SourceItemRejection =
  | "empty"
  | "too_long"
  | "quote_length"
  | "quote_not_in_source"
  | "wrong_language"
  | "source_meta_reference"
  | "bad_card"
  | "bad_blank"
  | "answer_not_in_statement";

export type SourceItemValidation =
  | { ok: true; item: SourceItemDraft }
  | { ok: false; reason: SourceItemRejection };

const QUOTE_MARKS = /["'`«»„“”‟‘’‚‛‹›]/gu;

export function normalizeForQuoteMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(QUOTE_MARKS, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isQuoteInSource(quote: string, sourceText: string): boolean {
  const normalizedQuote = normalizeForQuoteMatch(quote);

  return normalizedQuote.length > 0 && normalizeForQuoteMatch(sourceText).includes(normalizedQuote);
}

export function normalizeStatement(statement: string): string {
  return normalizeForQuoteMatch(statement);
}

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

function validateCard(item: SourceItemDraft, sourceText: string): SourceItemRejection | null {
  if (isYesNoQuestion(item.question, item.answer)) {
    return "bad_card";
  }

  const card = validateBasicCard({ front: item.question, back: item.answer }, sourceText);

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

export function validateSourceItem(raw: SourceItemDraft, sourceText: string): SourceItemValidation {
  const item: SourceItemDraft = {
    kind: raw.kind,
    statement: raw.statement.trim(),
    question: raw.question.trim(),
    answer: raw.answer.trim(),
    quote: raw.quote.trim(),
  };

  if (!item.statement || !item.question || !item.answer || !item.quote) {
    return { ok: false, reason: "empty" };
  }

  if (item.statement.length > SOURCE_ITEM_STATEMENT_MAX_CHARS) {
    return { ok: false, reason: "too_long" };
  }

  if (item.quote.length < SOURCE_ITEM_QUOTE_MIN_CHARS || item.quote.length > SOURCE_ITEM_QUOTE_MAX_CHARS) {
    return { ok: false, reason: "quote_length" };
  }

  if (!isQuoteInSource(item.quote, sourceText)) {
    return { ok: false, reason: "quote_not_in_source" };
  }

  const texts = [item.statement, item.question, item.answer];

  if (texts.some((text) => looksLikeDifferentScript(sourceText, text) || hasForeignScriptRun(sourceText, text))) {
    return { ok: false, reason: "wrong_language" };
  }

  if (texts.some((text) => looksLikeSourceMetaReference(sourceText, text))) {
    return { ok: false, reason: "source_meta_reference" };
  }

  if (item.kind !== "fill_blank") {
    const cardRejection = validateCard(item, sourceText);

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

  return validateCard(asBasic, sourceText) ? { ok: false, reason: blankRejection } : { ok: true, item: asBasic };
}

export interface SourceItemBatchValidation {
  valid: SourceItemDraft[];
  dropped: SourceItemRejection[];
}

export function validateSourceItems(
  drafts: readonly SourceItemDraft[],
  sourceText: string,
): SourceItemBatchValidation {
  const valid: SourceItemDraft[] = [];
  const dropped: SourceItemRejection[] = [];

  for (const draft of drafts) {
    const result = validateSourceItem(draft, sourceText);

    if (result.ok) {
      valid.push(result.item);
    } else {
      dropped.push(result.reason);
    }
  }

  return { valid, dropped };
}

export function selectNewItems(
  valid: readonly SourceItemDraft[],
  seenStatements: Set<string>,
  limit: number,
): SourceItemDraft[] {
  const taken: SourceItemDraft[] = [];

  for (const item of valid) {
    const key = normalizeStatement(item.statement);

    if (taken.length >= limit) {
      break;
    }

    if (!seenStatements.has(key)) {
      seenStatements.add(key);
      taken.push(item);
    }
  }

  return taken;
}
