import type { ProbeScope } from "@post-anki/shared";
import { getActiveProbeSession } from "../api/client.js";
import { setChatContext } from "../session/chat-context.repo.js";
import type { ChatContext } from "../session/chat-context.repo.js";
import { editMessageText } from "../telegram/bot.js";
import { endKeyboard } from "./quiz-flow.js";

export async function endQuiz(chatId: number, messageId: number, context: ChatContext): Promise<void> {
  const scope = (context.scopeKind ?? "topic") as ProbeScope;
  const scopeId = context.scopeId ?? "";
  const label = context.label ?? "this topic";
  const session = await getActiveProbeSession(scope, scopeId);

  await setChatContext(chatId, { ...context, mode: "idle", sessionId: null, currentItemId: null });

  const score = session
    ? ` ${session.correct}/${session.answered} correct, ${session.answered} of ${session.total} answered.`
    : "";

  await editMessageText(chatId, messageId, `⏹ Quiz ended for ${label}.${score}`, endKeyboard(scope));
}
