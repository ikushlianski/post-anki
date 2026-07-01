import type { ProbeScope, ProbeSession } from "@post-anki/shared";
import { editMessageText, sendChatAction } from "../telegram/bot.js";
import {
  answerProbeSession,
  getActiveProbeSession,
  prepareProbeSession,
} from "../api/client.js";
import { setChatContext } from "../session/chat-context.repo.js";
import type { ChatContext } from "../session/chat-context.repo.js";
import { buildCallback } from "../nav/callback.js";
import type { InlineKeyboard } from "../telegram/bot.js";
import {
  findQuestion,
  firstUnanswered,
  formatAnswerReveal,
  formatQuestion,
  formatQuizComplete,
} from "./quiz-view.js";

const GENERATING = "⏳ Generating your quiz (questions + answers) and saving it…";

function optionKeyboard(optionCount: number): InlineKeyboard {
  const rows: InlineKeyboard = [];

  for (let i = 0; i < optionCount; i += 1) {
    rows.push([{ text: String(i + 1), callback_data: buildCallback("answer", String(i)) }]);
  }

  return rows;
}

function regenerateButton(scope: ProbeScope): InlineKeyboard {
  const kind = scope === "topic" ? "regenerate_topic" : "regenerate_module";

  return [[{ text: "🔄 Regenerate quiz", callback_data: buildCallback(kind) }]];
}

async function persist(
  chatId: number,
  session: ProbeSession,
  questionId: string | null,
  label: string,
  messageId: number,
): Promise<void> {
  await setChatContext(chatId, {
    mode: "quiz",
    sessionId: session.id,
    currentItemId: questionId,
    scopeKind: session.scope,
    scopeId: session.scopeId,
    navCurriculumId: session.curriculumId,
    label,
    messageId,
  });
}

export async function renderSession(
  chatId: number,
  messageId: number,
  session: ProbeSession,
  label: string,
): Promise<void> {
  const next = firstUnanswered(session);

  if (!next) {
    await editMessageText(
      chatId,
      messageId,
      `✅ All questions answered for ${label}. ${session.correct}/${session.total} correct.`,
    );

    return;
  }

  await persist(chatId, session, next.id, label, messageId);

  const keyboard = [
    ...optionKeyboard(next.options.length),
    ...regenerateButton(session.scope),
  ];

  await editMessageText(
    chatId,
    messageId,
    formatQuestion(next, {
      answered: session.answered,
      total: session.total,
      correct: session.correct,
    }),
    keyboard,
  );
}

export async function startQuiz(
  chatId: number,
  messageId: number,
  scope: ProbeScope,
  scopeId: string,
  label: string,
  regenerate: boolean,
): Promise<void> {
  await editMessageText(chatId, messageId, GENERATING);
  await sendChatAction(chatId, "typing");

  const existing = regenerate ? null : await getActiveProbeSession(scope, scopeId);
  const session =
    existing ?? (await prepareProbeSession({ scope, scopeId, regenerate }));

  await renderSession(chatId, messageId, session, label);
}

export async function submitQuizAnswer(
  chatId: number,
  messageId: number,
  context: ChatContext,
  selectedIndex: number,
): Promise<void> {
  if (!context.sessionId || !context.currentItemId) {
    return;
  }

  const result = await answerProbeSession(context.sessionId, {
    questionId: context.currentItemId,
    selectedIndex,
  });

  const scope = (context.scopeKind ?? "topic") as ProbeScope;
  const scopeId = context.scopeId ?? "";
  const session = await getActiveProbeSession(scope, scopeId);
  const question = session ? findQuestion(session, result.questionId) : null;
  const label = context.label ?? "this topic";

  if (result.status === "completed") {
    await setChatContext(chatId, {
      ...context,
      mode: "idle",
      sessionId: null,
      currentItemId: null,
    });
    await editMessageText(chatId, messageId, formatQuizComplete(result, label));

    return;
  }

  const revealText = question
    ? formatAnswerReveal(result, question)
    : `Answered. ${result.correct}/${result.answered} correct.`;

  await editMessageText(chatId, messageId, revealText, [
    [{ text: "Next →", callback_data: buildCallback("next") }],
  ]);
}

export async function nextQuizQuestion(
  chatId: number,
  messageId: number,
  context: ChatContext,
): Promise<void> {
  const scope = (context.scopeKind ?? "topic") as ProbeScope;
  const scopeId = context.scopeId ?? "";
  const session = await getActiveProbeSession(scope, scopeId);

  if (!session) {
    await editMessageText(chatId, messageId, "That quiz is no longer active.");

    return;
  }

  await renderSession(chatId, messageId, session, context.label ?? "this topic");
}
