import { log } from "../telegram/log.js";
import { formatStreakReply, type StreakSummary } from "./streak-command.js";

export const STREAK_UNREACHABLE_REPLY =
  "Couldn't reach your stats right now — try again in a moment.";

export interface StreakCommandDeps {
  fetchSummary: () => Promise<StreakSummary>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  webBaseUrl?: string;
}

export async function handleStreakCommand(chatId: number, deps: StreakCommandDeps): Promise<void> {
  let summary: StreakSummary;

  try {
    summary = await deps.fetchSummary();
  } catch (err) {
    log.error({ err, chat_id: chatId }, "streak_command_fetch_failed");
    await deps.sendMessage(chatId, STREAK_UNREACHABLE_REPLY);

    return;
  }

  await deps.sendMessage(chatId, formatStreakReply(summary, deps.webBaseUrl));
}
