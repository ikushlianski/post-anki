import type { KnowledgeBitFeedbackReason, RejectedCardsPage } from "@post-anki/shared";
import { log } from "../telegram/log.js";
import {
  REJECTED_LIMIT,
  formatRejectedReply,
  parseReasonArg,
  parseSearchArg,
} from "./rejected-command.js";

export const REJECTED_UNREACHABLE_REPLY =
  "Couldn't reach your rejected cards right now — try again in a moment.";

export interface RejectedCommandDeps {
  fetchRejected: (input: {
    limit: number;
    reason?: KnowledgeBitFeedbackReason;
    q?: string;
  }) => Promise<RejectedCardsPage>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  webBaseUrl?: string;
}

export async function handleRejectedCommand(
  chatId: number,
  arg: string | null,
  deps: RejectedCommandDeps,
): Promise<void> {
  const reason = parseReasonArg(arg);
  const query = reason ? null : parseSearchArg(arg);

  let page: RejectedCardsPage;

  try {
    page = await deps.fetchRejected({
      limit: REJECTED_LIMIT,
      ...(reason ? { reason } : {}),
      ...(query ? { q: query } : {}),
    });
  } catch (err) {
    log.error({ err, chat_id: chatId }, "rejected_command_fetch_failed");
    await deps.sendMessage(chatId, REJECTED_UNREACHABLE_REPLY);

    return;
  }

  const { items, reasonCounts, hasMore } = page;

  await deps.sendMessage(
    chatId,
    formatRejectedReply({ items, reasonCounts, hasMore, reason, query, webBaseUrl: deps.webBaseUrl }),
  );
}
