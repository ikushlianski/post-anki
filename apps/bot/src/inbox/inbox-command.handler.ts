import { log } from "../telegram/log.js";
import { formatInboxReply, type InboxSummary } from "./inbox-command.js";

export const INBOX_UNREACHABLE_REPLY =
  "Couldn't reach your Inbox right now — try again in a moment.";

export interface InboxCommandDeps {
  fetchInbox: () => Promise<InboxSummary>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  webBaseUrl?: string;
}

export async function handleInboxCommand(chatId: number, deps: InboxCommandDeps): Promise<void> {
  let summary: InboxSummary;

  try {
    summary = await deps.fetchInbox();
  } catch (err) {
    log.error({ err, chat_id: chatId }, "inbox_command_fetch_failed");
    await deps.sendMessage(chatId, INBOX_UNREACHABLE_REPLY);

    return;
  }

  await deps.sendMessage(chatId, formatInboxReply(summary, deps.webBaseUrl));
}
