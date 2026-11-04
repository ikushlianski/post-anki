import type { ChatQueueKnowledgeBit } from "@post-anki/shared";
import { sliceWithoutSplittingPairs } from "../telegram/safe-slice.js";
import { formatWaitDuration } from "./format-wait-duration.js";

const MAX_CARDS = 10;
const PREVIEW_CHARS = 60;
const SUBJECT_CHARS = 24;

export const EMPTY_CHAT_REPLY = "No Chat cards waiting.";

export interface ChatCommandInput {
  items: ChatQueueKnowledgeBit[];
  now: Date;
  webBaseUrl?: string;
  pageArg?: string | null;
  hasMore?: boolean;
  total?: number;
}

function sortWaiting(items: ChatQueueKnowledgeBit[], now: Date): ChatQueueKnowledgeBit[] {
  return items
    .filter((item) => !item.snoozedUntil || new Date(item.snoozedUntil).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.chatAt).getTime() - new Date(b.chatAt).getTime());
}

function countSnoozed(items: ChatQueueKnowledgeBit[], now: Date): number {
  return items.filter(
    (item) => item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now.getTime(),
  ).length;
}

export function selectOldestWaiting(
  items: ChatQueueKnowledgeBit[],
  now: Date,
): ChatQueueKnowledgeBit[] {
  return sortWaiting(items, now).slice(0, MAX_CARDS);
}

export function parsePageArg(arg: string | null | undefined): number | null {
  if (arg === null || arg === undefined || arg.trim() === "") {
    return 1;
  }

  return /^\d+$/.test(arg.trim()) ? Number(arg.trim()) : null;
}

export function previewBody(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();

  return flat.length > PREVIEW_CHARS ? `${sliceWithoutSplittingPairs(flat, PREVIEW_CHARS)}…` : flat;
}

export function formatSubject(name: string | null | undefined): string | null {
  const trimmed = name?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.length > SUBJECT_CHARS ? `${sliceWithoutSplittingPairs(trimmed, SUBJECT_CHARS)}…` : trimmed;
}

export function formatChatCommandReply(input: ChatCommandInput): string {
  const { now, webBaseUrl } = input;
  const waiting = sortWaiting(input.items, now);

  if (waiting.length === 0) {
    const snoozedCount = countSnoozed(input.items, now);

    return snoozedCount > 0
      ? `No Chat cards waiting — ${snoozedCount} snoozed.`
      : EMPTY_CHAT_REPLY;
  }

  const totalPages = Math.ceil(waiting.length / MAX_CARDS);
  const page = parsePageArg(input.pageArg);

  if (page === null || page < 1) {
    return `Page must be a whole number from 1 to ${totalPages}, e.g. /chat 2.`;
  }

  if (page > totalPages) {
    return `Page ${page} doesn't exist — there ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`}.`;
  }

  const cards = waiting.slice((page - 1) * MAX_CARDS, page * MAX_CARDS);

  const base = webBaseUrl ? webBaseUrl.replace(/\/+$/, "") : null;
  const lines = cards.flatMap((card) => {
    const waited = formatWaitDuration(new Date(card.chatAt), now);
    const subject = formatSubject(card.subjectName);
    const line = `• ${waited} · ${subject ? `${subject} · ` : ""}${previewBody(card.body)}`;

    return base ? [line, `${base}/knowledge/chat?card=${encodeURIComponent(card.id)}`] : [line];
  });

  const footer =
    totalPages > 1
      ? [
          page < totalPages
            ? `Page ${page} of ${totalPages} — send /chat ${page + 1} for the next page.`
            : `Page ${page} of ${totalPages}`,
        ]
      : [];

  const total = waiting.length;
  const snoozed = countSnoozed(input.items, now);
  const snoozedPart = snoozed > 0 ? `, ${snoozed} snoozed` : "";
  const shown = input.items.length;
  const count = input.hasMore ? `${total}+` : `${total}`;
  const noun = total === 1 && !input.hasMore ? "card" : "cards";
  const header = `💬 ${count} Chat ${noun} waiting${snoozedPart}, oldest first:`;
  const truncated = input.hasMore
    ? [`Showing the first ${shown}${input.total === undefined ? "" : ` of ${input.total}`}`]
    : [];

  return [header, ...lines, ...footer, ...truncated].join("\n");
}
