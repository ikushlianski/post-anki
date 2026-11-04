import type { CallbackQuery } from "grammy/types";
import { getCurriculumDetail } from "../api/client.js";
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
} from "../telegram/bot.js";
import {
  getChatContext,
  setNavCurriculum,
} from "../session/chat-context.repo.js";
import { log } from "../telegram/log.js";
import { startQuiz } from "../quiz/quiz-flow.js";
import { onAnswer, onEndQuiz, onNext, regenerateModule, regenerateTopic } from "./quiz-callbacks.js";
import { endSocratic, startSocratic } from "../socratic/socratic-flow.js";
import { finalizeForPivot } from "../socratic/session-pivot-flow.js";
import { handleCheckinCallback, handleTriageCallback } from "../gap-triage/gap-triage-flow.js";
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

export interface CallbackExtras {
  onPauseDigest?: (chatId: number) => Promise<void>;
  webBaseUrl?: string;
}

export async function handleCallback(query: CallbackQuery, extras: CallbackExtras = {}): Promise<void> {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  try {
    await answerCallbackQuery(query.id);
  } catch (err) {
    log.warn({ err, callback_query_id: query.id }, "callback_answer_failed");
  }

  if (typeof chatId !== "number" || typeof messageId !== "number" || !data) {
    return;
  }

  const { kind, arg } = parseCallback(data);

  try {
    if (kind === "pause_digest") {
      try {
        await extras.onPauseDigest?.(chatId);
      } catch (err) {
        log.error({ err, chat_id: chatId, kind }, "callback_error");
      }

      return;
    }

    await route(chatId, messageId, kind, arg, extras.webBaseUrl);
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
  webBaseUrl?: string,
): Promise<void> {
  if (kind === "home") {
    await editScreen(chatId, messageId, await showSubjects(chatId, webBaseUrl));
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

  if (kind === "next" || kind === "skip") {
    await onNext(chatId, messageId);
    return;
  }

  if (kind === "end_quiz") {
    await onEndQuiz(chatId, messageId);
    return;
  }

  if (kind === "continue") {
    await onContinue(chatId, messageId, webBaseUrl);
    return;
  }

  if (
    kind === "triage_important" ||
    kind === "triage_defer" ||
    kind === "triage_dismiss" ||
    kind === "triage_dismiss_shortcut"
  ) {
    await handleTriageCallback(chatId, messageId, arg, kind);
    return;
  }

  if (kind === "checkin_confirm" || kind === "checkin_revisit") {
    await handleCheckinCallback(chatId, messageId, arg, kind);
    return;
  }

  if (kind === "save_for_next") {
    await saveForNext(chatId, messageId);
  }
}

// #27's extension point (spec.md Decision 5) — reuses endSocratic verbatim,
// the exact /done path, zero new backend logic. Unreachable in production
// until a future story supplies isIntensityMode: true (session-checkpoint-
// view.ts's only caller always passes false).
async function saveForNext(chatId: number, messageId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (context?.sessionId) {
    await endSocratic(chatId, context);
  }

  await editMessageText(chatId, messageId, "Saved. Send /today or tap a topic to pick up later.");
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

  if (context?.mode === "socratic" && context.sessionId && context.scopeId !== topicId) {
    const { notice } = await finalizeForPivot(context, label);

    if (notice) await sendMessage(chatId, notice);
  }

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

  if (context?.mode === "socratic" && context.sessionId) {
    const { notice } = await finalizeForPivot(context, label);

    if (notice) await sendMessage(chatId, notice);
  }

  await startQuiz(chatId, messageId, "module", moduleId, label, false);
}

async function onContinue(chatId: number, messageId: number, webBaseUrl?: string): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context || context.mode === "idle") {
    await editScreen(chatId, messageId, await showSubjects(chatId, webBaseUrl));
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
