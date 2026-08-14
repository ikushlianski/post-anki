import {
  editMessageText,
  sendChatAction,
  sendMessage,
  sendMessageWithKeyboard,
} from "../telegram/bot.js";
import {
  answerSocraticSession,
  completeSocraticSessionNow,
  startSocraticSession,
} from "../api/client.js";
import { clearChatContext, setChatContext } from "../session/chat-context.repo.js";
import type { ChatContext } from "../session/chat-context.repo.js";
import { formatSocraticAnswer, formatTurn } from "./socratic-view.js";
import { buildCheckpointKeyboard } from "./session-checkpoint-view.js";
import { formatSessionSummary } from "./session-summary-view.js";

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
    await sendMessage(chatId, formatSocraticAnswer(result));
    return;
  }

  await setChatContext(chatId, { ...context, currentItemId: result.next.id });

  if (result.checkpointReached && result.checkpointSummary) {
    await sendMessageWithKeyboard(
      chatId,
      formatSessionSummary(result.checkpointSummary),
      buildCheckpointKeyboard(false),
    );
    return;
  }

  await sendMessage(chatId, formatSocraticAnswer(result));
}

// `/done` (issue #27, spec.md Decision 3) — ends the current Socratic
// session immediately via the same finalize path the inactivity sweep uses
// (completeSocraticSessionNow -> completeSessionNow's shared CAS). Chat
// context clears unconditionally: even if this call loses the race to a
// concurrent sweep, the user's intent was to leave the session, and the
// other caller already handled the summary.
export async function endSocratic(chatId: number, context: ChatContext): Promise<void> {
  if (!context.sessionId) {
    return;
  }

  const result = await completeSocraticSessionNow(context.sessionId);

  if (result.completed && result.summary) {
    await sendMessage(chatId, formatSessionSummary(result.summary));
  }

  await clearChatContext(chatId);
}
