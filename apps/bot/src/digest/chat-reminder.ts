import { CHAT_QUEUE_REMINDER_AFTER_DAYS, type StaleChatQueueSummary } from "@post-anki/shared";

const DAY_MS = 86_400_000;

export interface ChatReminderInput {
  summary: StaleChatQueueSummary;
  now: Date;
  webBaseUrl?: string;
}

export function formatChatReminder(input: ChatReminderInput): string | null {
  const { summary, now, webBaseUrl } = input;

  if (summary.count === 0 || summary.oldestChatAt === null) {
    return null;
  }

  const ageDays = Math.max(
    CHAT_QUEUE_REMINDER_AFTER_DAYS,
    Math.floor((now.getTime() - new Date(summary.oldestChatAt).getTime()) / DAY_MS),
  );
  const noun = summary.count === 1 ? "card has" : "cards have";
  const line = `💬 ${summary.count} Chat ${noun} been waiting over ${CHAT_QUEUE_REMINDER_AFTER_DAYS} days. The oldest has waited ${ageDays} days.`;

  if (!webBaseUrl) {
    return line;
  }

  return `${line}\n${webBaseUrl.replace(/\/+$/, "")}/knowledge/chat`;
}

export interface ReminderDayStore {
  claimDay(day: string): Promise<boolean>;
  releaseDay(day: string): Promise<void>;
}

export function createMemoryReminderDayStore(): ReminderDayStore {
  let lastDay: string | null = null;

  return {
    async claimDay(day) {
      if (day === lastDay) {
        return false;
      }

      lastDay = day;

      return true;
    },
    async releaseDay(day) {
      if (day === lastDay) {
        lastDay = null;
      }
    },
  };
}

export function createDailyReminderGate(
  store: ReminderDayStore = createMemoryReminderDayStore(),
): (now: Date) => Promise<boolean> {
  return (now) => store.claimDay(now.toISOString().slice(0, 10));
}
