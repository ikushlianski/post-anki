import {
  editMessageText,
  sendChatAction,
  sendMessage,
} from "../telegram/bot.js";
import {
  answerSocraticSession,
  startSocraticSession,
} from "../api/client.js";
import { setChatContext } from "../session/chat-context.repo.js";
import type { ChatContext } from "../session/chat-context.repo.js";
import { formatSocraticAnswer, formatTurn } from "./socratic-view.js";

export async function startSocratic(
  chatId: number,
  messageId: number,
  topicId: string,
  label: string,
): Promise<void> {
  await editMessageText(chatId, messageId, "⏳ Preparing your conversation…");
  await sendChatAction(chatId, "typing");

  const session = await startSocraticSession({ topicId });

  if (!session.current) {
    await editMessageText(
      chatId,
      messageId,
      `Nothing left to discuss for ${label}.`,
    );

    return;
  }

  await setChatContext(chatId, {
    mode: "socratic",
    sessionId: session.id,
    currentItemId: session.current.id,
    scopeKind: "topic",
    scopeId: session.topicId,
    navCurriculumId: session.curriculumId,
    label,
    messageId,
  });

  await editMessageText(chatId, messageId, formatTurn(session.current, session));
}

export async function answerSocratic(
  chatId: number,
  context: ChatContext,
  text: string,
): Promise<void> {
  if (!context.sessionId || !context.currentItemId) {
    return;
  }

  await sendChatAction(chatId, "typing");

  const result = await answerSocraticSession(context.sessionId, {
    turnId: context.currentItemId,
    answer: text,
  });

  if (result.status === "completed" || !result.next) {
    await setChatContext(chatId, {
      ...context,
      mode: "idle",
      sessionId: null,
      currentItemId: null,
    });
  } else {
    await setChatContext(chatId, { ...context, currentItemId: result.next.id });
  }

  await sendMessage(chatId, formatSocraticAnswer(result));
}
