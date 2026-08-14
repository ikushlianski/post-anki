import { sendMessage } from "../telegram/bot.js";
import { checkSocraticSessionIdle } from "../api/client.js";
import { clearChatContext, getChatContext } from "../session/chat-context.repo.js";
import { formatSessionSummary } from "./session-summary-view.js";

// The bot's POST /session-idle-sweep handler body (issue #27, spec.md
// Decision 5) — mirrors gap-triage-flow.ts's runGapResurface shape.
// Single-owner-chat architecture: one chat_context row read per invocation,
// no table scan. Sends the summary BEFORE clearing chat context, so a
// sendMessage failure leaves context intact for the next sweep to retry
// rather than silently losing the summary — the known limitation is that
// once the CAS below has already flipped the session to completed, a
// retried sweep's own check-idle call will see the session inactive and
// return `{ idle: false }`, so a failed send is not actually retried; this
// is disclosed, not fixed, in this story.
export async function runSessionIdleSweep(chatId: number): Promise<void> {
  const context = await getChatContext(chatId);

  if (!context || context.mode !== "socratic" || !context.sessionId) {
    return;
  }

  const result = await checkSocraticSessionIdle(context.sessionId);

  if (!result.idle) {
    return;
  }

  if (result.summary) {
    await sendMessage(chatId, formatSessionSummary(result.summary));
  }

  await clearChatContext(chatId);
}
