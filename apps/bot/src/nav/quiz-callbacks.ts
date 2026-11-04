import { editMessageText } from "../telegram/bot.js";
import { getChatContext } from "../session/chat-context.repo.js";
import { nextQuizQuestion, startQuiz, submitQuizAnswer } from "../quiz/quiz-flow.js";
import { endQuiz } from "../quiz/quiz-end.js";

export const STALE_QUIZ_REPLY = "That quiz has ended — send /start to begin a new one.";

export async function regenerateTopic(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context?.scopeId) {
    await editMessageText(chatId, messageId, STALE_QUIZ_REPLY);
    return;
  }

  await startQuiz(chatId, messageId, "topic", context.scopeId, context.label ?? "this topic", true);
}

export async function regenerateModule(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context?.scopeId) {
    await editMessageText(chatId, messageId, STALE_QUIZ_REPLY);
    return;
  }

  await startQuiz(chatId, messageId, "module", context.scopeId, context.label ?? "this module", true);
}

export async function onAnswer(chatId: number, messageId: number, arg: string): Promise<void> {
  const context = await getChatContext(chatId);
  const selectedIndex = Number.parseInt(arg, 10);

  if (!context || context.mode !== "quiz" || Number.isNaN(selectedIndex)) {
    await editMessageText(chatId, messageId, STALE_QUIZ_REPLY);
    return;
  }

  await submitQuizAnswer(chatId, messageId, context, selectedIndex);
}

export async function onNext(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context || context.mode !== "quiz") {
    await editMessageText(chatId, messageId, STALE_QUIZ_REPLY);
    return;
  }

  await nextQuizQuestion(chatId, messageId, context);
}

export async function onEndQuiz(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context || context.mode !== "quiz") {
    await editMessageText(chatId, messageId, STALE_QUIZ_REPLY);
    return;
  }

  await endQuiz(chatId, messageId, context);
}
