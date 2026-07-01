import type { Message, Update } from "grammy/types";
import type { QuestionKind } from "@post-anki/shared";
import { isAuthorizedChat } from "../auth/owner.js";
import {
  selectReply,
  formatErrorReply,
  DECLINE_REPLY,
} from "../conversation/reply.js";
import {
  answerPending,
  sendTodaysQuestion,
  type FlowDeps,
} from "../conversation/probe-flow.js";
import { isDuplicateUpdate, type UpdateLru } from "./update-lru.js";
import { log } from "./log.js";

export type ChatMode = "idle" | "quiz" | "socratic";

export interface ChatContextLike {
  mode: ChatMode;
  sessionId: string | null;
  currentItemId: string | null;
  scopeKind: string | null;
  scopeId: string | null;
  navCurriculumId: string | null;
  label: string | null;
  messageId: number | null;
}

export type HandlerDeps = {
  ownerChatId: number;
  lru: UpdateLru;
  flow: FlowDeps;
  defaultMode: QuestionKind;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  getChatContext?: (chatId: number) => Promise<ChatContextLike | null>;
  onStart?: (chatId: number) => Promise<void>;
  onCallback?: (update: Update) => Promise<void>;
  onSocraticText?: (
    chatId: number,
    context: ChatContextLike,
    text: string,
  ) => Promise<void>;
  onQuizText?: (chatId: number) => Promise<void>;
  clearChatContext?: (chatId: number) => Promise<void>;
};

export async function handleUpdate(update: Update, deps: HandlerDeps): Promise<void> {
  const { ownerChatId, lru } = deps;

  if (!isAuthorizedChat(update, ownerChatId)) {
    log.warn({ update_id: update.update_id }, "unauthorised_update");
    return;
  }

  if (isDuplicateUpdate(update.update_id, lru)) {
    log.info({ update_id: update.update_id }, "duplicate_update_id");
    return;
  }

  if (update.callback_query) {
    if (deps.onCallback) {
      await deps.onCallback(update);
    }

    return;
  }

  const message = update.message ?? update.edited_message;

  if (!message) {
    log.info({ update_id: update.update_id }, "non_message_update_ignored");
    return;
  }

  await handleMessage(message, deps);
}

async function handleMessage(message: Message, deps: HandlerDeps): Promise<void> {
  const { flow, defaultMode, sendMessage } = deps;
  const chatId = message.chat.id;
  const decision = selectReply(message);

  if (decision.kind === "start") {
    if (deps.onStart) {
      await deps.onStart(chatId);
    } else {
      await sendMessage(chatId, DECLINE_REPLY);
    }

    return;
  }

  if (decision.kind === "decline") {
    await sendMessage(chatId, DECLINE_REPLY);
    return;
  }

  const started = Date.now();

  try {
    if (decision.kind === "today") {
      if (deps.clearChatContext) {
        await deps.clearChatContext(chatId);
      }

      const reply = await sendTodaysQuestion(chatId, defaultMode, flow);
      await sendMessage(chatId, reply);
      return;
    }

    const context = deps.getChatContext
      ? await deps.getChatContext(chatId)
      : null;

    if (context && context.mode === "socratic" && deps.onSocraticText) {
      await deps.onSocraticText(chatId, context, decision.text);
      return;
    }

    if (context && context.mode === "quiz") {
      if (deps.onQuizText) {
        await deps.onQuizText(chatId);
      } else {
        await sendMessage(chatId, "Tap one of the answer buttons above.");
      }

      return;
    }

    const reply = await answerPending(chatId, decision.text, flow);
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
