import { and, desc, eq, ne } from "drizzle-orm";
import {
  extractNotionPageId,
  type NotionIngestionRunStatus,
  type NotionIngestionSource,
  type NotionSourceFrequency,
  type UpdateNotionIngestionSourceInput,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { notionIngestionRuns, notionIngestionSources, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { hasPgErrorCode, PG_UNIQUE_VIOLATION } from "./pg-error.js";
import { deriveSubjectPath } from "../knowledge-bit/knowledge-bit-detail-subject-path.js";
import { computeNextRunAt } from "./next-run-at.js";

export type NotionSourceRow = typeof notionIngestionSources.$inferSelect;

export const MEETING_PHRASES_PIPELINE = "meeting_phrases";

export interface NewNotionSource {
  name: string;
  pageUrl: string;
  subjectId: string;
  itemsPerRun: number;
  frequency: NotionSourceFrequency;
  removeAfterImport: boolean;
  pipeline?: string;
}

export type CreateNotionSourceResult =
  | { kind: "created"; source: NotionSourceRow }
  | { kind: "duplicate_page" }
  | { kind: "invalid_url" };

export type UpdateNotionSourceResult =
  | { kind: "updated"; source: NotionSourceRow }
  | { kind: "not_found" }
  | { kind: "duplicate_page" }
  | { kind: "invalid_url" };

export async function createNotionSource(
  input: NewNotionSource,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<CreateNotionSourceResult> {
  const pageId = extractNotionPageId(input.pageUrl);

  if (!pageId) {
    return { kind: "invalid_url" };
  }

  const [source] = await db
    .insert(notionIngestionSources)
    .values({
      id: newId("nis"),
      name: input.name,
      pageId,
      pageUrl: input.pageUrl,
      subjectId: input.subjectId,
      pipeline: input.pipeline ?? MEETING_PHRASES_PIPELINE,
      itemsPerRun: input.itemsPerRun,
      frequency: input.frequency,
      removeAfterImport: input.removeAfterImport,
      nextRunAt: computeNextRunAt(input.frequency, now),
    })
    .onConflictDoNothing({ target: notionIngestionSources.pageId })
    .returning();

  return source ? { kind: "created", source } : { kind: "duplicate_page" };
}

export async function getNotionSourceRow(
  id: string,
  db: DbExecutor = getDb(),
): Promise<NotionSourceRow | null> {
  const [row] = await db.select().from(notionIngestionSources).where(eq(notionIngestionSources.id, id));

  return row ?? null;
}

export async function updateNotionSource(
  id: string,
  patch: UpdateNotionIngestionSourceInput,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<UpdateNotionSourceResult> {
  const current = await getNotionSourceRow(id, db);

  if (!current) {
    return { kind: "not_found" };
  }

  const values: Partial<typeof notionIngestionSources.$inferInsert> = { updatedAt: now };

  if (patch.pageUrl !== undefined) {
    const pageId = extractNotionPageId(patch.pageUrl);

    if (!pageId) {
      return { kind: "invalid_url" };
    }

    const [clash] = await db
      .select({ id: notionIngestionSources.id })
      .from(notionIngestionSources)
      .where(and(eq(notionIngestionSources.pageId, pageId), ne(notionIngestionSources.id, id)));

    if (clash) {
      return { kind: "duplicate_page" };
    }

    values.pageId = pageId;
    values.pageUrl = patch.pageUrl;
  }

  if (patch.name !== undefined) values.name = patch.name;
  if (patch.subjectId !== undefined) values.subjectId = patch.subjectId;
  if (patch.itemsPerRun !== undefined) values.itemsPerRun = patch.itemsPerRun;
  if (patch.removeAfterImport !== undefined) values.removeAfterImport = patch.removeAfterImport;
  if (patch.paused !== undefined) values.paused = patch.paused;

  const frequency = patch.frequency ?? (current.frequency as NotionSourceFrequency);
  const frequencyChanged = patch.frequency !== undefined && patch.frequency !== current.frequency;
  const resumed = patch.paused === false && current.paused;

  if (patch.frequency !== undefined) values.frequency = patch.frequency;

  if (frequencyChanged || resumed) {
    values.nextRunAt = computeNextRunAt(frequency, now);
  }

  try {
    const [source] = await db
      .update(notionIngestionSources)
      .set(values)
      .where(eq(notionIngestionSources.id, id))
      .returning();

    return source ? { kind: "updated", source } : { kind: "not_found" };
  } catch (err) {
    if (hasPgErrorCode(err, PG_UNIQUE_VIOLATION)) {
      return { kind: "duplicate_page" };
    }

    throw err;
  }
}

export async function deleteNotionSource(id: string, db: DbExecutor = getDb()): Promise<boolean> {
  const deleted = await db
    .delete(notionIngestionSources)
    .where(eq(notionIngestionSources.id, id))
    .returning({ id: notionIngestionSources.id });

  return deleted.length > 0;
}

export async function listNotionSources(db: DbExecutor = getDb()): Promise<NotionIngestionSource[]> {
  const [rows, subjectRows, runs] = await Promise.all([
    db.select().from(notionIngestionSources).orderBy(notionIngestionSources.createdAt),
    db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
    db
      .selectDistinctOn([notionIngestionRuns.sourceId])
      .from(notionIngestionRuns)
      .orderBy(notionIngestionRuns.sourceId, desc(notionIngestionRuns.startedAt)),
  ]);
  const lastRunBySource = new Map(runs.map((run) => [run.sourceId, run]));

  return rows.map((row) => toNotionSourceView(row, subjectRows, lastRunBySource.get(row.id)));
}

export async function getNotionSourceView(
  id: string,
  db: DbExecutor = getDb(),
): Promise<NotionIngestionSource | null> {
  const row = await getNotionSourceRow(id, db);

  if (!row) {
    return null;
  }

  const [subjectRows, [run]] = await Promise.all([
    db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
    db
      .select()
      .from(notionIngestionRuns)
      .where(eq(notionIngestionRuns.sourceId, id))
      .orderBy(desc(notionIngestionRuns.startedAt))
      .limit(1),
  ]);

  return toNotionSourceView(row, subjectRows, run);
}

function toNotionSourceView(
  row: NotionSourceRow,
  subjectRows: { id: string; name: string; parentId: string | null }[],
  run: typeof notionIngestionRuns.$inferSelect | undefined,
): NotionIngestionSource {
  return {
    id: row.id,
    name: row.name,
    pageUrl: row.pageUrl,
    subjectId: row.subjectId,
    subjectPath: deriveSubjectPath(row.subjectId, subjectRows),
    itemsPerRun: row.itemsPerRun,
    frequency: row.frequency as NotionSourceFrequency,
    removeAfterImport: row.removeAfterImport,
    paused: row.paused,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRun: run
      ? {
          status: run.status as NotionIngestionRunStatus,
          finishedAt: run.finishedAt?.toISOString() ?? null,
          imported: run.imported,
          removed: run.removed,
          errorCode: run.errorCode,
        }
      : null,
  };
}
