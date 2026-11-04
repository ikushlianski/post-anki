import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { reminderState } from "../db/schema.js";
import type { ReminderDayStore } from "./chat-reminder.js";
import type { ReminderPauseStore } from "./reminder-pause.js";

const CHAT_REMINDER_KEY = "chat_reminder";
export const DAILY_PUSH_KEY = "daily_push";
const PAUSE_KEY = "reminders_paused_until";

export function createDbReminderDayStore(key: string = CHAT_REMINDER_KEY): ReminderDayStore {
  return {
    async claimDay(day) {
      const db = getDb();
      const inserted = await db
        .insert(reminderState)
        .values({ key: key, lastSentDay: day })
        .onConflictDoNothing()
        .returning({ key: reminderState.key });

      if (inserted.length > 0) {
        return true;
      }

      const updated = await db
        .update(reminderState)
        .set({ lastSentDay: day })
        .where(and(eq(reminderState.key, key), lt(reminderState.lastSentDay, day)))
        .returning({ key: reminderState.key });

      return updated.length > 0;
    },
    async releaseDay(day) {
      await getDb()
        .delete(reminderState)
        .where(and(eq(reminderState.key, key), eq(reminderState.lastSentDay, day)));
    },
  };
}

export function createDbReminderPauseStore(): ReminderPauseStore {
  return {
    async getResumeDay() {
      const rows = await getDb()
        .select({ day: reminderState.lastSentDay })
        .from(reminderState)
        .where(eq(reminderState.key, PAUSE_KEY));

      return rows[0]?.day ?? null;
    },
    async setResumeDay(day) {
      await getDb()
        .insert(reminderState)
        .values({ key: PAUSE_KEY, lastSentDay: day })
        .onConflictDoUpdate({ target: reminderState.key, set: { lastSentDay: day } });
    },
    async clear() {
      await getDb().delete(reminderState).where(eq(reminderState.key, PAUSE_KEY));
    },
  };
}
