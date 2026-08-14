import type { CompleteSocraticSessionResult } from "@post-anki/shared";
import { completeSocraticSessionNow } from "../api/client.js";
import { SKIP_ACK } from "../conversation/reply.js";
import { sendMessage, sendMessageWithKeyboard } from "../telegram/bot.js";
import {
  clearChatContext,
  setNavCurriculum,
  type ChatContext,
} from "../session/chat-context.repo.js";
import { startQuiz } from "../quiz/quiz-flow.js";
import { startSocratic } from "./socratic-flow.js";
import { findRegisteredTopic, isSteerShaped } from "./topic-match.js";

// #25 needs a 0-1 vs 2+ split on exchangeCount, not #27's own 0 vs 1+
// suppression (finalizeSession's answered.length === 0 check on the backend
// is untouched — see spec.md "Verified facts"). Below this many exchanges,
// both the pivot and skip paths treat the old session as not worth a
// separate "saving your progress" mention.
const NOTICE_MIN_EXCHANGES = 2;

function shouldNote(
  result: CompleteSocraticSessionResult,
): result is CompleteSocraticSessionResult & {
  completed: true;
  summary: NonNullable<CompleteSocraticSessionResult["summary"]>;
} {
  return result.completed && result.summary !== null && result.summary.exchangeCount >= NOTICE_MIN_EXCHANGES;
}

export interface PivotFinalizeResult {
  notice: string | null;
}

// Shared by both pivot entry points (menu tap, free text) — spec.md
// Decision 1. `completed: false` covers a lost CAS race (the idle sweep or
// a concurrent /done already won): the pivot proceeds silently, navigation
// is never blocked by a lost race.
export async function finalizeForPivot(
  context: ChatContext,
  newTopicLabel: string,
): Promise<PivotFinalizeResult> {
  if (!context.sessionId) return { notice: null };

  const result = await completeSocraticSessionNow(context.sessionId);

  if (!shouldNote(result)) return { notice: null };

  return {
    notice: `Switching to ${newTopicLabel}. Saving your ${result.summary.topicTitle} progress.`,
  };
}

// `skip` reuses the pivot split's exact threshold but is always exactly one
// message, and — unlike a pivot — never starts anything new. Chat context
// clears to idle either way (spec.md Decision 4).
export async function finalizeForSkip(chatId: number, context: ChatContext): Promise<void> {
  let savedNote = "";

  if (context.sessionId) {
    const result = await completeSocraticSessionNow(context.sessionId);

    if (shouldNote(result)) {
      savedNote = ` Saved your ${result.summary.topicTitle} progress.`;
    }
  }

  // Send before clearing (mirrors endSocratic/runSessionIdleSweep) — a
  // sendMessage failure should leave context intact for a retry rather than
  // silently losing the acknowledgment.
  await sendMessage(chatId, `${SKIP_ACK}${savedNote}`);
  await clearChatContext(chatId);
}

// The free-text pivot's full I/O chain (spec.md Decision 2/3) — the `onSteer`
// dep wired in webhook.handler.ts. Returns false (no I/O beyond the shape
// check) for anything that isn't steer-shaped or matches no registered
// topic, so an unmatched phrase or a real Socratic answer falls through to
// the caller's existing dispatch untouched.
export async function steerToTopic(
  chatId: number,
  context: ChatContext,
  text: string,
): Promise<boolean> {
  if (!isSteerShaped(text)) return false;

  const match = await findRegisteredTopic(text);

  if (!match) return false;

  // Re-tapping/re-naming the topic already under discussion is not steering
  // away (mirrors dispatcher.ts's startTopic AC 2 guard) — a short answer
  // that happens to name the current topic ("lambda keeps it warm") must
  // stay a normal answer, not restart the very session it belongs to.
  if (match.topicId === context.scopeId) return false;

  const { notice } = await finalizeForPivot(context, match.title);

  if (notice) await sendMessage(chatId, notice);

  if (match.curriculumId !== context.navCurriculumId) {
    await setNavCurriculum(chatId, match.curriculumId);
  }

  const ackId = await sendMessageWithKeyboard(chatId, `Sure — let's talk about ${match.title}.`, []);

  if (match.topicStatus === "not_started") {
    await startQuiz(chatId, ackId, "topic", match.topicId, match.title, false);
  } else {
    await startSocratic(chatId, ackId, match.topicId, match.title);
  }

  return true;
}
