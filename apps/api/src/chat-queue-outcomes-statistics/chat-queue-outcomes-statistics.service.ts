import { CHAT_QUEUE_OUTCOMES_WINDOW_DAYS, type ChatQueueOutcomesStatistics } from "@post-anki/shared";
import { readChatQueueOutcomeRow, type RawChatQueueOutcomeRow } from "./chat-queue-outcomes-statistics.repo.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildChatQueueOutcomesStatistics(row: RawChatQueueOutcomeRow): ChatQueueOutcomesStatistics {
  const { accepted, rejected, waiting, snoozed } = row;

  return {
    windowDays: CHAT_QUEUE_OUTCOMES_WINDOW_DAYS,
    total: accepted + rejected + waiting + snoozed,
    accepted,
    rejected,
    waiting,
    snoozed,
  };
}

export async function getChatQueueOutcomesStatistics(now: Date = new Date()): Promise<ChatQueueOutcomesStatistics> {
  const since = new Date(now.getTime() - CHAT_QUEUE_OUTCOMES_WINDOW_DAYS * DAY_MS);

  return buildChatQueueOutcomesStatistics(await readChatQueueOutcomeRow(since));
}
