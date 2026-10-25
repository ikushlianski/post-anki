import { z } from "zod";

export const EXTRACTION_STUCK_AFTER_MS = 20 * 60 * 1000;
export const ATTENTION_FIRST_WORDS_MAX_CHARS = 80;

export const GENERIC_EXTRACTION_FAILURE_WORDING =
  "Something went wrong while reading this note. Retry usually fixes it.";

const EXTRACTION_FAILURE_WORDING: Record<string, string> = {
  no_valid_items: "The AI could not produce a usable card from this note.",
  wrong_language: "The AI wrote cards in a different language than your note.",
  source_empty: "This note has no text.",
  source_too_long: "This note is too long (over 50,000 characters). Split it and add the parts separately.",
  source_chunk_missing: GENERIC_EXTRACTION_FAILURE_WORDING,
  extraction_failed: GENERIC_EXTRACTION_FAILURE_WORDING,
  workflow_executor_lost: GENERIC_EXTRACTION_FAILURE_WORDING,
  knowledge_source_reclaimed: GENERIC_EXTRACTION_FAILURE_WORDING,
  provider_rate_limited: "The AI service is busy. This note will be tried again, or retry in a few minutes.",
};

export const EXTRACTION_STUCK_WORDING = "Still working after more than 20 minutes.";
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

export function cardFlagWording(flag: string | null | undefined): string {
  return lookup(CARD_FLAG_WORDING, flag) ?? GENERIC_CARD_FLAG_WORDING;
}

export const knowledgeSourceAttentionKindSchema = z.enum(["failed", "empty_result", "stuck", "rate_limited"]);

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

  if (input.status === "bits_detected" && input.liveCardCount === 0 && !input.processed) {
    return "empty_result";
  }

  return null;
}
