import { z } from "zod";
import { KNOWLEDGE_SOURCE_MAX_CHARS } from "./knowledge-source-refusal";

const SOURCE_MAX_CHARS_LABEL = KNOWLEDGE_SOURCE_MAX_CHARS.toLocaleString("en-US");

export const EXTRACTION_STUCK_AFTER_MS = 20 * 60 * 1000;
export const ATTENTION_FIRST_WORDS_MAX_CHARS = 80;

export const GENERIC_EXTRACTION_FAILURE_WORDING =
  "Something went wrong while reading this note. Retry usually fixes it.";

export const ITEM_CAP_REACHED_REASON = "item_cap_reached";
export const KNOWLEDGE_SOURCE_MAX_ITEMS = 40;

const EXTRACTION_FAILURE_WORDING: Record<string, string> = {
  no_valid_items: "The AI could not produce a usable card from this note.",
  wrong_language: "The AI wrote cards in a different language than your note.",
  source_empty: "This note has no text.",
  source_too_long: `This note is too long (over ${SOURCE_MAX_CHARS_LABEL} characters). Split it and add the parts separately.`,
  source_chunk_missing: GENERIC_EXTRACTION_FAILURE_WORDING,
  extraction_failed: GENERIC_EXTRACTION_FAILURE_WORDING,
  workflow_executor_lost: GENERIC_EXTRACTION_FAILURE_WORDING,
  knowledge_source_reclaimed: GENERIC_EXTRACTION_FAILURE_WORDING,
  item_cap_reached: `Stopped at ${KNOWLEDGE_SOURCE_MAX_ITEMS} cards. The rest of this note was not read. Add the rest as a second note.`,
  llm_budget_paused: "Daily AI limit reached. This note will work again after midnight UTC.",
  provider_rate_limited: "The AI service is busy. This note will be tried again, or retry in a few minutes.",
};

export const EXTRACTION_STUCK_WORDING = "Still working after more than 20 minutes.";
export const EXTRACTION_NOTHING_EXTRACTED_WORDING = "Nothing here looked worth turning into a card.";
export const EXTRACTION_EMPTY_RESULT_WORDING = "The AI finished but found nothing to turn into a card.";

const CARD_FLAG_WORDING: Record<string, string> = {
  bad_card: "The card is not a good question and answer pair",
  source_meta_reference: "The card refers to the note itself instead of the content",
  wrong_language: "The card is in a different language than your note",
  quote_not_in_source: "The supporting quote could not be matched to your note",
  quote_length: "The supporting quote could not be matched to your note",
  too_long: "The card is too long",
  bad_blank: "The fill-in-the-blank is malformed",
  answer_not_in_statement: "The fill-in-the-blank is malformed",
  non_native_phrase:
    "This phrase may be misheard or not native. An AI-suggested version is shown beside it",
};

export const GENERIC_CARD_FLAG_WORDING = "The card needs a manual check before approval";

function lookup(table: Record<string, string>, code: string | null | undefined): string | undefined {
  if (typeof code !== "string" || !Object.hasOwn(table, code)) {
    return undefined;
  }

  return table[code];
}

export function extractionFailureWording(reason: string | null | undefined): string {
  return lookup(EXTRACTION_FAILURE_WORDING, reason) ?? GENERIC_EXTRACTION_FAILURE_WORDING;
}

const NON_NATIVE_WITHOUT_SUGGESTION_WORDING = "This phrase may be misheard or not native";

export function cardFlagWording(flag: string | null | undefined, hasSuggestion = true): string {
  if (flag === "non_native_phrase" && !hasSuggestion) {
    return NON_NATIVE_WITHOUT_SUGGESTION_WORDING;
  }

  return lookup(CARD_FLAG_WORDING, flag) ?? GENERIC_CARD_FLAG_WORDING;
}

export const knowledgeSourceAttentionKindSchema = z.enum(["failed", "empty_result", "nothing_extracted", "stuck", "rate_limited", "capped"]);

export type KnowledgeSourceAttentionKind = z.infer<typeof knowledgeSourceAttentionKindSchema>;

export const knowledgeSourceAttentionSchema = z.object({
  knowledgeSourceId: z.string(),
  kind: knowledgeSourceAttentionKindSchema,
  reason: z.string().nullable(),
  firstWords: z.string(),
  sourceText: z.string().nullable(),
  since: z.string(),
});

export type KnowledgeSourceAttention = z.infer<typeof knowledgeSourceAttentionSchema>;

export function attentionWording(kind: KnowledgeSourceAttentionKind, reason: string | null | undefined): string {
  if (kind === "stuck") {
    return EXTRACTION_STUCK_WORDING;
  }

  if (kind === "nothing_extracted") {
    return EXTRACTION_NOTHING_EXTRACTED_WORDING;
  }

  if (kind === "empty_result") {
    return EXTRACTION_EMPTY_RESULT_WORDING;
  }

  return extractionFailureWording(reason);
}

export function attentionFirstWords(rawText: string | null | undefined): string {
  const flat = (rawText ?? "").replace(/\s+/g, " ").trim();

  if (flat.length <= ATTENTION_FIRST_WORDS_MAX_CHARS) {
    return flat;
  }

  return `${flat.slice(0, ATTENTION_FIRST_WORDS_MAX_CHARS).trimEnd()}...`;
}

export function deriveAttentionKind(input: {
  status: string;
  failureReason: string | null;
  updatedAt: Date;
  liveCardCount: number;
  processed: boolean;
  nothingExtractedAt?: Date | null;
  now?: Date;
}): KnowledgeSourceAttentionKind | null {
  const now = (input.now ?? new Date()).getTime();

  if (input.status === "failed") {
    return "failed";
  }

  if (input.status === "processing") {
    if (now - input.updatedAt.getTime() > EXTRACTION_STUCK_AFTER_MS) {
      return "stuck";
    }

    return input.failureReason === "provider_rate_limited" ? "rate_limited" : null;
  }

  if (input.nothingExtractedAt && input.liveCardCount === 0) {
    return "nothing_extracted";
  }

  if (input.status === "bits_detected" && input.failureReason === ITEM_CAP_REACHED_REASON && !input.processed) {
    return "capped";
  }

  if (input.status === "bits_detected" && input.liveCardCount === 0 && !input.processed) {
    return "empty_result";
  }

  return null;
}
