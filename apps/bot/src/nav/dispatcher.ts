import type { CallbackQuery } from "grammy/types";
import { getCurriculumDetail } from "../api/client.js";
import {
  answerCallbackQuery,
  editMessageText,
} from "../telegram/bot.js";
import {
  getChatContext,
  setNavCurriculum,
} from "../session/chat-context.repo.js";
import { log } from "../telegram/log.js";
import {
  nextQuizQuestion,
  startQuiz,
  submitQuizAnswer,
} from "../quiz/quiz-flow.js";
import { startSocratic } from "../socratic/socratic-flow.js";
import { parseCallback } from "./callback.js";
import {
  editScreen,
  showCurricula,
  showCurriculum,
  showModule,
  showSubjects,
  showTopic,
} from "./menu.js";

function curriculumLabel(name: string, moduleTitle?: string, topicTitle?: string): string {
  return [name, moduleTitle, topicTitle].filter(Boolean).join(" › ");
}

async function locateTopic(curriculumId: string, topicId: string) {
  const detail = await getCurriculumDetail(curriculumId);

  for (const m of detail.modules) {
    const topic = m.topics.find((t) => t.id === topicId);

    if (topic) {
      return { detail, module: m, topic };
    }
  }

  return { detail, module: null, topic: null };
}

async function moduleLabel(curriculumId: string, moduleId: string): Promise<string> {
  const detail = await getCurriculumDetail(curriculumId);
  const mod = detail.modules.find((m) => m.id === moduleId);

  return curriculumLabel(detail.curriculum.name, mod?.title);
}

export async function handleCallback(query: CallbackQuery): Promise<void> {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  await answerCallbackQuery(query.id);

  if (typeof chatId !== "number" || typeof messageId !== "number" || !data) {
    return;
  }

  const { kind, arg } = parseCallback(data);

  try {
    await route(chatId, messageId, kind, arg);
  } catch (err) {
    log.error({ err, chat_id: chatId, kind }, "callback_error");
    await editMessageText(chatId, messageId, "Had a hiccup — send /start to begin again.");
  }
}

async function route(
  chatId: number,
  messageId: number,
  kind: ReturnType<typeof parseCallback>["kind"],
  arg: string,
): Promise<void> {
  if (kind === "home") {
    await editScreen(chatId, messageId, await showSubjects(chatId));
    return;
  }

  if (kind === "subject") {
    await editScreen(chatId, messageId, await showCurricula(arg));
    return;
  }

  if (kind === "curriculum") {
    await setNavCurriculum(chatId, arg);
    await editScreen(chatId, messageId, await showCurriculum(arg));
    return;
  }

  if (kind === "module") {
    await editScreen(chatId, messageId, await showModule(chatId, arg));
    return;
  }

  if (kind === "topic") {
    await editScreen(chatId, messageId, await showTopic(chatId, arg));
    return;
  }

  if (kind === "start_topic") {
    await startTopic(chatId, messageId, arg);
    return;
  }

  if (kind === "start_module") {
    await startModule(chatId, messageId, arg);
    return;
  }

  if (kind === "regenerate_topic") {
    await regenerateTopic(chatId, messageId);
    return;
  }

  if (kind === "regenerate_module") {
    await regenerateModule(chatId, messageId);
    return;
  }

  if (kind === "answer") {
    await onAnswer(chatId, messageId, arg);
    return;
  }

  if (kind === "next") {
    await onNext(chatId, messageId);
    return;
  }

  if (kind === "continue") {
    await onContinue(chatId, messageId);
  }
}

async function startTopic(
  chatId: number,
  messageId: number,
  topicId: string,
): Promise<void> {
  const context = await getChatContext(chatId);
  const curriculumId = context?.navCurriculumId;

  if (!curriculumId) {
    await editMessageText(chatId, messageId, "Send /start to begin again.");
    return;
  }

  const { detail, module, topic } = await locateTopic(curriculumId, topicId);

  if (!topic || !module) {
    await editMessageText(chatId, messageId, "That topic is gone.");
    return;
  }

  const label = curriculumLabel(detail.curriculum.name, module.title, topic.title);

  if (topic.progress.status === "not_started") {
    await startQuiz(chatId, messageId, "topic", topicId, label, false);
    return;
  }

  await startSocratic(chatId, messageId, topicId, label);
}

async function startModule(
  chatId: number,
  messageId: number,
  moduleId: string,
): Promise<void> {
  const context = await getChatContext(chatId);
  const curriculumId = context?.navCurriculumId;

  if (!curriculumId) {
    await editMessageText(chatId, messageId, "Send /start to begin again.");
    return;
  }

  const label = await moduleLabel(curriculumId, moduleId);

  await startQuiz(chatId, messageId, "module", moduleId, label, false);
}

async function regenerateTopic(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context?.scopeId) {
    return;
  }

  await startQuiz(chatId, messageId, "topic", context.scopeId, context.label ?? "this topic", true);
}

async function regenerateModule(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context?.scopeId) {
    return;
  }

  await startQuiz(chatId, messageId, "module", context.scopeId, context.label ?? "this module", true);
}

async function onAnswer(
  chatId: number,
  messageId: number,
  arg: string,
): Promise<void> {
  const context = await getChatContext(chatId);
  const selectedIndex = Number.parseInt(arg, 10);

  if (!context || context.mode !== "quiz" || Number.isNaN(selectedIndex)) {
    return;
  }

  await submitQuizAnswer(chatId, messageId, context, selectedIndex);
}

async function onNext(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context || context.mode !== "quiz") {
    return;
  }

  await nextQuizQuestion(chatId, messageId, context);
}

async function onContinue(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context || context.mode === "idle") {
    await editScreen(chatId, messageId, await showSubjects(chatId));
    return;
  }

  if (context.mode === "quiz" && context.scopeKind && context.scopeId) {
    await startQuiz(
      chatId,
      messageId,
      context.scopeKind as "topic" | "module",
      context.scopeId,
      context.label ?? "your quiz",
      false,
    );
    return;
  }

  if (context.mode === "socratic" && context.scopeId) {
    await startSocratic(chatId, messageId, context.scopeId, context.label ?? "your topic");
  }
}
