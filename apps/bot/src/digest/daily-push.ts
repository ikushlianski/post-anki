import { log } from "../telegram/log.js";
import type { ReminderDayStore } from "./chat-reminder.js";
import { localDay } from "./reminder-pause.js";

export interface DailyPushDeps {
  now: () => Date;
  getTimeZone: () => Promise<string>;
  isPaused: () => Promise<boolean>;
  pushStore: ReminderDayStore;
  reminderStore: ReminderDayStore;
  sendQuestion: () => Promise<string>;
  getReminderText: () => Promise<string | null>;
  sendDigest: (questionText: string, reminder: string | null) => Promise<void>;
}

export type DailyPushOutcome = "sent" | "paused" | "duplicate";

async function claimReminder(store: ReminderDayStore, day: string): Promise<void> {
  try {
    await store.claimDay(day);
  } catch (err) {
    log.error({ err }, "chat_reminder_claim_failed");
  }
}

async function releasePush(store: ReminderDayStore, day: string): Promise<void> {
  try {
    await store.releaseDay(day);
  } catch (err) {
    log.error({ err, day }, "daily_push_release_failed");
  }
}

export async function runDailyPush(deps: DailyPushDeps): Promise<DailyPushOutcome> {
  if (await deps.isPaused()) return "paused";

  const day = localDay(deps.now(), await deps.getTimeZone());

  if (!(await deps.pushStore.claimDay(day))) return "duplicate";

  try {
    const questionText = await deps.sendQuestion();
    const reminderText = await deps.getReminderText();

    await deps.sendDigest(questionText, reminderText);

    if (reminderText !== null) await claimReminder(deps.reminderStore, day);

    return "sent";
  } catch (err) {
    await releasePush(deps.pushStore, day);

    throw err;
  }
}
