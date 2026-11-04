import {
  formatPauseReply,
  parsePauseDays,
  PAUSE_USAGE_REPLY,
  resumeDayAfter,
  RESUME_REPLY,
  type ReminderPauseStore,
} from "./reminder-pause.js";

export interface PauseCommandDeps {
  store: ReminderPauseStore;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  now?: () => Date;
  getTimeZone?: () => Promise<string>;
}

export async function handlePauseCommand(
  chatId: number,
  arg: string | null,
  deps: PauseCommandDeps,
): Promise<void> {
  const days = parsePauseDays(arg);

  if (days === null) {
    await deps.sendMessage(chatId, PAUSE_USAGE_REPLY);
    return;
  }

  const timeZone = deps.getTimeZone ? await deps.getTimeZone() : undefined;
  const resumeDay = resumeDayAfter((deps.now ?? (() => new Date()))(), days, timeZone);

  await deps.store.setResumeDay(resumeDay);
  await deps.sendMessage(chatId, formatPauseReply(days, resumeDay));
}

export async function handleResumeCommand(
  chatId: number,
  deps: Pick<PauseCommandDeps, "store" | "sendMessage">,
): Promise<void> {
  await deps.store.clear();
  await deps.sendMessage(chatId, RESUME_REPLY);
}
