import type { Update } from "grammy/types";
import type { QuestionKind } from "@post-anki/shared";
import { isAuthorizedChat } from "../auth/owner.js";
import {
  selectReply,
  formatErrorReply,
  START_REPLY,
  DECLINE_REPLY,
} from "../conversation/reply.js";
import {
  answerPending,
  sendTodaysQuestion,
  type FlowDeps,
} from "../conversation/probe-flow.js";
import { isDuplicateUpdate, type UpdateLru } from "./update-lru.js";
import { log } from "./log.js";

export type HandlerDeps = {
  ownerChatId: number;
  lru: UpdateLru;
  flow: FlowDeps;
  defaultMode: QuestionKind;
  sendMessage: (chatId: number, text: string) => Promise<void>;
};

export async function handleUpdate(update: Update, deps: HandlerDeps): Promise<void> {
  const { ownerChatId, lru, flow, defaultMode, sendMessage } = deps;

  if (!isAuthorizedChat(update, ownerChatId)) {
    log.warn({ update_id: update.update_id }, "unauthorised_update");
    return;
  }

  if (isDuplicateUpdate(update.update_id, lru)) {
    log.info({ update_id: update.update_id }, "duplicate_update_id");
    return;
  }

  const message = update.message ?? update.edited_message;

  if (!message) {
    log.info({ update_id: update.update_id }, "non_message_update_ignored");
    return;
  }

  const chatId = message.chat.id;
  const decision = selectReply(message);

  if (decision.kind === "start") {
    await sendMessage(chatId, START_REPLY);
    return;
  }

  if (decision.kind === "decline") {
    await sendMessage(chatId, DECLINE_REPLY);
    return;
  }

  const started = Date.now();

  try {
    const reply =
      decision.kind === "today"
        ? await sendTodaysQuestion(chatId, defaultMode, flow)
        : await answerPending(chatId, decision.text, flow);

    await sendMessage(chatId, reply);
    log.info(
      { chat_id: chatId, kind: decision.kind, latency_ms: Date.now() - started },
      "replied",
    );
  } catch (err) {
    log.error({ err, chat_id: chatId }, "flow_error");
    await sendMessage(chatId, formatErrorReply(err));
  }
}
