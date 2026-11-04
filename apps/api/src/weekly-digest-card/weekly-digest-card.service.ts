import { weeklyDigestCardSchema, type WeeklyDigestCard } from "@post-anki/shared";
import { readChatActivity } from "../llm-call-events/llm-call-events-chat-activity.repo.js";
import { countChatQueueKnowledgeBits } from "../knowledge-bit/knowledge-bit-chat-queue.repo.js";
import { readRejectReasonCounts, readTopRejectReasons, readWindowCounts } from "./weekly-digest-card.repo.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getWeeklyDigestCard(now: Date = new Date()): Promise<WeeklyDigestCard> {
  const windowStart = new Date(now.getTime() - WEEK_MS);
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS);

  const [current, previous, chatBacklog, topRejectReasons, chatActivity] = await Promise.all([
    readWindowCounts(windowStart, now),
    readWindowCounts(previousStart, windowStart),
    countChatQueueKnowledgeBits(),
    readTopRejectReasons(windowStart, now),
    readChatActivity(windowStart, now),
  ]);

  const previousReasonCounts = await readRejectReasonCounts(
    topRejectReasons.map((row) => row.reason),
    previousStart,
    windowStart,
  );

  return weeklyDigestCardSchema.parse({
    current,
    previous,
    chatBacklog,
    topRejectReasons: topRejectReasons.map((row) => ({
      ...row,
      delta: row.count - (previousReasonCounts.get(row.reason) ?? 0),
    })),
    chatCards: chatActivity.cards,
    chatTurns: chatActivity.turns,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
  });
}
