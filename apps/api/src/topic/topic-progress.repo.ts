import { eq } from "drizzle-orm";
import type {
  DepthLevel,
  LearningStatus,
  Topic,
  TopicProgress,
  TopicProgressStatus,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
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

// lms-buildout 0.2 — "queued" mirrors what a NULL row already means (still
// releasable, not yet released); it exists as an explicit value only for a
// future writer that wants to record "known queued" rather than leaving the
// column unset. "declined" is the one value that changes behaviour once a
// caller reads it: it means the learner explicitly excluded this topic and
// a slice release must never flip it back to included.
export type TopicReleaseState = "queued" | "declined";

export function rowReleaseState(row: TopicRow): TopicReleaseState | null {
  return (row.releaseState as TopicReleaseState | null) ?? null;
}

export async function setTopicReleaseState(
  topicId: string,
  releaseState: TopicReleaseState | null,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.update(topics).set({ releaseState }).where(eq(topics.id, topicId));
}

// lms-buildout 0.5 — storage for shouldOfferHeadroom's `lastOfferAt` input
// (packages/core/src/learning-list/headroom-offer.ts). Null means the
// headroom offer has never been shown for this topic.
export function rowHeadroomOfferedAt(row: TopicRow): string | null {
  return row.headroomOfferedAt ? row.headroomOfferedAt.toISOString() : null;
}

export async function setTopicHeadroomOfferedAt(
  topicId: string,
  headroomOfferedAt: string | null,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(topics)
    .set({ headroomOfferedAt: headroomOfferedAt ? new Date(headroomOfferedAt) : null })
    .where(eq(topics.id, topicId));
}
