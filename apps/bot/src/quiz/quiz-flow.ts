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
  let current = session;
  let next = firstUnanswered(current);

  // Equivalent of the web quiz's refetch-on-low: a session can look
  // finished purely because the last-loaded batch is exhausted while a
  // server-side replenish (triggered once remaining crossed the floor,
  // probe-session.service.ts) is still generating in the background.
  // One extra, bounded re-fetch here — never a timer/polling loop — is
  // enough to catch a top-up that already landed between whichever earlier
  // answer crossed the floor and this render, so the bot doesn't declare
  // "all done" and strand the learner while more questions are still on
  // the way (SCENARIO 17, 18).
  if (!next) {
    const refetched = await getActiveProbeSession(session.scope, session.scopeId);

    if (refetched) {
      current = refetched;
      next = firstUnanswered(current);
    }
  }

  if (!next) {
    await editMessageText(
      chatId,
      messageId,
      `✅ All questions answered for ${label}. ${current.correct}/${current.total} correct.`,
    );

    return;
  }

  await persist(chatId, current, next.id, label, messageId);

  const keyboard = [
    ...optionKeyboard(next.options.length),
    ...regenerateButton(current.scope),
  ];

  await editMessageText(
    chatId,
    messageId,
    formatQuestion(next, {
      answered: current.answered,
      total: current.total,
      correct: current.correct,
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

  // `result.status` reflects the state at the instant this answer was
  // recorded — the same request that may have just triggered a background
  // replenish (probe-session.service.ts). Prefer the freshly re-fetched
  // `session` (queried a moment later, above) when it disagrees: if an
  // earlier answer's replenish already landed by now, `session` will show
  // more unanswered questions even though this answer's own `result.status`
  // still says "completed" — using the fresher signal is what keeps the bot
  // from ending the chat context prematurely (SCENARIO 17, 18).
  const stillHasQuestions = session ? firstUnanswered(session) !== null : false;

  if (result.status === "completed" && !stillHasQuestions) {
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
