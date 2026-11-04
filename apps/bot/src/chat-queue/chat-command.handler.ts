import type { ChatQueueKnowledgeBitList } from "@post-anki/shared";
import { log } from "../telegram/log.js";
import { formatChatCommandReply } from "./chat-command.js";

export const CHAT_UNREACHABLE_REPLY = "Couldn't reach your cards right now — try again in a moment.";

export interface ChatCommandDeps {
  fetchQueue: () => Promise<ChatQueueKnowledgeBitList>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  now: () => Date;
  webBaseUrl?: string;
}

export async function handleChatCommand(
  chatId: number,
  deps: ChatCommandDeps,
  pageArg: string | null = null,
): Promise<void> {
  let list: ChatQueueKnowledgeBitList;

  try {
    list = await deps.fetchQueue();
  } catch (err) {
    log.error({ err, chat_id: chatId }, "chat_command_fetch_failed");
    await deps.sendMessage(chatId, CHAT_UNREACHABLE_REPLY);

    return;
  }

  await deps.sendMessage(
    chatId,
    formatChatCommandReply({
      items: list.items,
      now: deps.now(),
      webBaseUrl: deps.webBaseUrl,
      pageArg,
      hasMore: list.hasMore,
      total: list.total,
    }),
  );
}
