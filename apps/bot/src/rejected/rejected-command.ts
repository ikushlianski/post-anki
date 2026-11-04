import { sliceWithoutSplittingPairs } from "../telegram/safe-slice.js";
import {
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  knowledgeBitFeedbackReasonSchema,
  type KnowledgeBitFeedbackReason,
  type RejectedCard,
} from "@post-anki/shared";

export const REJECTED_LIMIT = 5;
export const EMPTY_REJECTED_REPLY = "No rejected cards.";

const PREVIEW_CHARS = 120;
const NOTE_CHARS = 60;
export const MAX_SEARCH_CHARS = 200;
export const TELEGRAM_MESSAGE_LIMIT = 4096;

export function parseReasonArg(arg: string | null): KnowledgeBitFeedbackReason | null {
  if (!arg) return null;

  const parsed = knowledgeBitFeedbackReasonSchema.safeParse(arg.trim().toLowerCase());

  return parsed.success ? parsed.data : null;
}

export function parseSearchArg(arg: string | null): string | null {
  const q = arg?.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_CHARS).trim();

  return q ? q : null;
}

export function formatInvalidReasonReply(): string {
  const codes = knowledgeBitFeedbackReasonSchema.options.join(", ");

  return `Unknown reason. Valid codes: ${codes}`;
}

export function previewRejectedBody(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();

  return flat.length > PREVIEW_CHARS ? `${sliceWithoutSplittingPairs(flat, PREVIEW_CHARS)}…` : flat;
}

export function previewRejectNote(note: string | null | undefined): string | null {
  const flat = note?.replace(/\s+/g, " ").trim();

  if (!flat) return null;

  return flat.length > NOTE_CHARS ? `${sliceWithoutSplittingPairs(flat, NOTE_CHARS)}…` : flat;
}

export function formatReasonCountsLine(counts?: Record<string, number>): string | null {
  if (!counts) return null;

  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => {
      const label = (KNOWLEDGE_BIT_REJECT_REASON_LABELS as Record<string, string>)[code] ?? code;

      return `${label} ${count}`;
    });

  return parts.length > 0 ? `Reasons: ${parts.join(" · ")}` : null;
}

export function countHiddenCards(input: {
  shown: number;
  reasonCounts?: Record<string, number>;
  reason?: KnowledgeBitFeedbackReason | null;
}): number | null {
  if (!input.reasonCounts) return null;

  const total = input.reason
    ? (input.reasonCounts[input.reason] ?? 0)
    : Object.values(input.reasonCounts).reduce((sum, count) => sum + count, 0);

  return total > input.shown ? total - input.shown : null;
}

function formatMoreLine(hidden: number | null, link: string | null): string {
  const label = hidden === null ? "More rejected cards" : `+${hidden} more`;

  return link ? `${label} — open Rejected: ${link}` : label;
}

export function formatRejectedReply(input: {
  items: RejectedCard[];
  reasonCounts?: Record<string, number>;
  hasMore?: boolean;
  reason?: KnowledgeBitFeedbackReason | null;
  webBaseUrl?: string;
  query?: string | null;
}): string {
  const cards = input.items.slice(0, REJECTED_LIMIT);

  if (cards.length === 0) {
    return input.query ? `No rejected cards match "${input.query}".` : EMPTY_REJECTED_REPLY;
  }

  const lines = cards.map((card) => {
    const note = previewRejectNote(card.note);
    const reason = `Reason: ${KNOWLEDGE_BIT_REJECT_REASON_LABELS[card.reasonCode]}`;

    return `• ${previewRejectedBody(card.body)}\n  ${note ? `${reason} — ${note}` : reason}`;
  });

  const link = input.webBaseUrl ? `${input.webBaseUrl.replace(/\/+$/, "")}/knowledge/rejected` : null;

  if (input.hasMore) {
    const hidden = countHiddenCards({
      shown: cards.length,
      reasonCounts: input.reasonCounts,
      reason: input.reason,
    });

    lines.push(formatMoreLine(hidden, link));
  } else if (link) {
    lines.push(link);
  }

  const countsLine = formatReasonCountsLine(input.reasonCounts);
  const title = input.query ? `Rejected cards matching "${input.query}":` : "Latest rejected cards:";
  const head = countsLine ? [countsLine, title] : [title];
  const reply = [...head, ...lines].join("\n");

  return reply.length > TELEGRAM_MESSAGE_LIMIT
    ? `${sliceWithoutSplittingPairs(reply, TELEGRAM_MESSAGE_LIMIT - 1)}…`
    : reply;
}
