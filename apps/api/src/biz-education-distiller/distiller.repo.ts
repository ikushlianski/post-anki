import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  bizEducationDistillFailures,
  contentInbox,
  curricula,
  subjects,
  topics,
} from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface HierarchyTopic {
  topicId: string;
  topicTitle: string;
  curriculumName: string;
  subjectName: string;
}

// Personal-app scale cap on the topic hierarchy fed into the classification prompt — see
// SEARCH_NAME_MATCH_LIMIT in search.repo.ts for the same shape.
export const TOPIC_HIERARCHY_PROMPT_LIMIT = 500;

export async function listHierarchyForClassification(): Promise<HierarchyTopic[]> {
  const rows = await getDb()
    .select({
      topicId: topics.id,
      topicTitle: topics.title,
      curriculumName: curricula.name,
      subjectName: subjects.name,
    })
    .from(topics)
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
    .orderBy(topics.id)
    .limit(TOPIC_HIERARCHY_PROMPT_LIMIT);

  return rows;
}

export interface InsertContentInboxInput {
  body: string;
  sourceRef: string;
  suggestedPlacement: string;
}

export async function insertContentInboxRow(input: InsertContentInboxInput): Promise<void> {
  await getDb()
    .insert(contentInbox)
    .values({ id: newId("inbox"), ...input })
    .onConflictDoNothing({ target: contentInbox.sourceRef });
}

export interface ContentInboxRow {
  id: string;
  body: string;
  sourceRef: string;
  suggestedPlacement: string;
  createdAt: Date;
}

export async function listContentInbox(): Promise<ContentInboxRow[]> {
  return getDb().select().from(contentInbox).orderBy(desc(contentInbox.createdAt));
}

// Atomic upsert (never read-then-write) — returns the row's new failure count.
export async function recordDistillFailure(sourceRef: string): Promise<number> {
  const [row] = await getDb()
    .insert(bizEducationDistillFailures)
    .values({ sourceRef, failureCount: 1, lastFailedAt: new Date() })
    .onConflictDoUpdate({
      target: bizEducationDistillFailures.sourceRef,
      set: {
        failureCount: sql`${bizEducationDistillFailures.failureCount} + 1`,
        lastFailedAt: new Date(),
      },
    })
    .returning({ failureCount: bizEducationDistillFailures.failureCount });

  if (!row) {
    throw new Error(`recordDistillFailure: upsert returned no row for ${sourceRef}`);
  }

  return row.failureCount;
}
