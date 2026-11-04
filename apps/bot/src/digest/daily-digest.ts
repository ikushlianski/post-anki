import { buildCallback } from "../nav/callback.js";
import type { InlineKeyboard } from "../telegram/bot.js";

export interface DailyDigestInput {
  dueQueueCount: number;
  gapsDueCount: number;
  questionText: string;
  chatReminder?: string | null;
  cardsDueCount?: number;
  streakDays?: number;
  inboxCount?: number;
  webBaseUrl?: string;
}

export function formatDailyDigest(input: DailyDigestInput): string {
  const summaryLines: string[] = [];

  if (input.cardsDueCount && input.cardsDueCount > 0) {
    const line = `🗂 ${input.cardsDueCount} ${input.cardsDueCount === 1 ? "card" : "cards"} due`;

    summaryLines.push(
      input.webBaseUrl ? `${line} — ${input.webBaseUrl.replace(/\/+$/, "")}/knowledge/review` : line,
    );
  }

  if (input.streakDays && input.streakDays > 0) {
    summaryLines.push(`🔥 ${input.streakDays}-day streak`);
  }

  if (input.inboxCount && input.inboxCount > 0) {
    const line = `📥 ${input.inboxCount} waiting for triage`;

    summaryLines.push(
      input.webBaseUrl ? `${line} — ${input.webBaseUrl.replace(/\/+$/, "")}/knowledge/inbox` : line,
    );
  }

  if (input.dueQueueCount > 0) {
    summaryLines.push(
      `📚 ${input.dueQueueCount} topic${input.dueQueueCount === 1 ? "" : "s"} due for review`,
    );
  }

  if (input.gapsDueCount > 0) {
    summaryLines.push(
      `🔁 ${input.gapsDueCount} gap${input.gapsDueCount === 1 ? "" : "s"} due to resurface`,
    );
  }

  if (input.chatReminder) {
    summaryLines.push(input.chatReminder);
  }

  if (summaryLines.length === 0) {
    return input.questionText;
  }

  return [...summaryLines, "", input.questionText].join("\n");
}

export const PAUSE_DIGEST_DAYS = 7;

export function digestKeyboard(webBaseUrl?: string): InlineKeyboard {
  const row: InlineKeyboard[number] = [
    { text: `⏸ Pause ${PAUSE_DIGEST_DAYS} days`, callback_data: buildCallback("pause_digest") },
  ];

  if (webBaseUrl) {
    row.push({ text: "Open review", url: `${webBaseUrl.replace(/\/+$/, "")}/knowledge/review` });
  }

  return [row];
}
