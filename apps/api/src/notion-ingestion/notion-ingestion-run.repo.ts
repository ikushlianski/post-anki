import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { NotionIngestionRunStatus, NotionRunResult } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { notionIngestionRuns, notionIngestionSources } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { hasPgErrorCode, PG_FOREIGN_KEY_VIOLATION } from "./pg-error.js";

export const RUN_LOCK_WINDOW_MS = 10 * 60 * 1000;

export type RunTrigger = "manual" | "scheduled";

export type StartNotionRunResult =
  | { kind: "started"; runId: string }
  | { kind: "busy" }
  | { kind: "source_missing" };

export async function startNotionRun(
  sourceId: string,
  trigger: RunTrigger,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<StartNotionRunResult> {
  try {
    return await insertRunningRow(sourceId, trigger, now, db);
  } catch (err) {
    if (hasPgErrorCode(err, PG_FOREIGN_KEY_VIOLATION)) {
      return { kind: "source_missing" };
    }

    throw err;
  }
}

async function insertRunningRow(
  sourceId: string,
  trigger: RunTrigger,
  now: Date,
  db: DbExecutor,
): Promise<StartNotionRunResult> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT 1 FROM ${notionIngestionSources} WHERE id = ${sourceId} FOR UPDATE`,
    );

    if (locked.rows.length === 0) {
      return { kind: "source_missing" };
    }

    const [active] = await tx
      .select({ id: notionIngestionRuns.id })
      .from(notionIngestionRuns)
      .where(
        and(
          eq(notionIngestionRuns.sourceId, sourceId),
          eq(notionIngestionRuns.status, "running"),
          isNull(notionIngestionRuns.finishedAt),
          gt(notionIngestionRuns.startedAt, new Date(now.getTime() - RUN_LOCK_WINDOW_MS)),
        ),
      )
      .limit(1);

    if (active) {
      return { kind: "busy" };
    }

    const id = newId("nir");

    await tx.insert(notionIngestionRuns).values({ id, sourceId, trigger, status: "running", startedAt: now });

    return { kind: "started", runId: id };
  });
}

export async function finishNotionRun(
  runId: string,
  status: Exclude<NotionIngestionRunStatus, "running">,
  counts: Omit<NotionRunResult, "status">,
  errorCode: string | null,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(notionIngestionRuns)
    .set({
      status,
      readCount: counts.read,
      imported: counts.imported,
      skippedExisting: counts.skippedExisting,
      ignored: counts.ignored,
      removed: counts.removed,
      removeFailed: counts.removeFailed,
      errorCode,
      finishedAt: now,
    })
    .where(eq(notionIngestionRuns.id, runId));
}
