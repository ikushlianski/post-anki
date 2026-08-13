import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { probeSessionQuestions, socraticSessions, socraticTurns, topics } from "../db/schema.js";

export interface ResolvedStudyItem {
  topicId: string | null;
  topicTitle: string | null;
  itemText: string;
}

// Extracted from feedback.controller.ts (question-feedback-memory, issue
// #78-adjacent) so open-questions-review (issue #87) can reuse the same
// server-side topic/item-text resolution instead of duplicating it — a
// client never supplies topicId/itemText directly for either feature; both
// resolve it from the source item id in the route path, preventing a
// spoofed topic/context on a captured question or a submitted feedback row.
async function resolveTopicTitle(topicId: string | null): Promise<string | null> {
  if (!topicId) {
    return null;
  }

  const row = (await getDb().select().from(topics).where(eq(topics.id, topicId)))[0];

  return row?.title ?? null;
}

export async function resolveProbeQuestionItem(
  questionId: string,
): Promise<ResolvedStudyItem | null> {
  const row = (
    await getDb()
      .select()
      .from(probeSessionQuestions)
      .where(eq(probeSessionQuestions.id, questionId))
  )[0];

  if (!row) {
    return null;
  }

  return {
    topicId: row.topicId,
    topicTitle: await resolveTopicTitle(row.topicId),
    itemText: row.prompt,
  };
}

export async function resolveSocraticTurnItem(
  turnId: string,
): Promise<ResolvedStudyItem | null> {
  const turnRow = (
    await getDb().select().from(socraticTurns).where(eq(socraticTurns.id, turnId))
  )[0];

  if (!turnRow) {
    return null;
  }

  const sessionRow = (
    await getDb()
      .select()
      .from(socraticSessions)
      .where(eq(socraticSessions.id, turnRow.sessionId))
  )[0];

  const topicId = sessionRow?.topicId ?? null;

  return {
    topicId,
    topicTitle: await resolveTopicTitle(topicId),
    itemText: turnRow.prompt,
  };
}
