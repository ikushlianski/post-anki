import type { WeeklyDigestCard } from "@post-anki/shared";
import { log } from "../telegram/log.js";
import { formatWeeklyDigestReply } from "./weekly-digest-command.js";

export const DIGEST_UNREACHABLE_REPLY =
  "Couldn't reach your digest right now — try again in a moment.";

export interface WeeklyDigestCommandDeps {
  fetchDigest: () => Promise<WeeklyDigestCard>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  webBaseUrl?: string;
}

export async function handleWeeklyDigestCommand(
  chatId: number,
  deps: WeeklyDigestCommandDeps,
): Promise<void> {
  let card: WeeklyDigestCard;

  try {
    card = await deps.fetchDigest();
  } catch (err) {
    log.error({ err, chat_id: chatId }, "digest_command_fetch_failed");
    await deps.sendMessage(chatId, DIGEST_UNREACHABLE_REPLY);

    return;
  }

  await deps.sendMessage(chatId, formatWeeklyDigestReply({ card, webBaseUrl: deps.webBaseUrl }));
}
