import { eq } from "drizzle-orm";
import type {
  DepthLevel,
  LearningStatus,
  Topic,
  TopicProgress,
  TopicProgressStatus,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { topics } from "../db/schema.js";

export type TopicRow = typeof topics.$inferSelect;

export async function getTopicRow(topicId: string): Promise<TopicRow | null> {
  const rows = await getDb().select().from(topics).where(eq(topics.id, topicId));

  return rows[0] ?? null;
}

export function rowDepth(row: TopicRow): DepthLevel {
  return row.depth as DepthLevel;
}

export async function writeTopicProgress(
  topicId: string,
  progress: TopicProgress,
  learningStatus: LearningStatus,
): Promise<void> {
  await getDb()
    .update(topics)
    .set({
      progressStatus: progress.status,
      progressMaturity: progress.maturity,
      progressAttempts: progress.attempts,
      progressLastInteractedAt: progress.lastInteractedAt
        ? new Date(progress.lastInteractedAt)
        : null,
      learningStatus,
    })
    .where(eq(topics.id, topicId));
}

export function rowToProgress(row: TopicRow): TopicProgress {
  return {
    status: row.progressStatus as TopicProgressStatus,
    maturity: row.progressMaturity,
    attempts: row.progressAttempts,
    lastInteractedAt: row.progressLastInteractedAt
      ? row.progressLastInteractedAt.toISOString()
      : null,
  };
}

export function rowLearningStatus(row: TopicRow): Topic["learningStatus"] {
  return row.learningStatus as LearningStatus;
}
