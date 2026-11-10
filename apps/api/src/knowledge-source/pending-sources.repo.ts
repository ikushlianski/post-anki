import { and, asc, count, eq, inArray, lt, min, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";

export async function listStalePendingSourceIds(
  minAgeMs: number,
  limit: number,
  db: DbExecutor = getDb(),
): Promise<string[]> {
  const cutoff = new Date(Date.now() - minAgeMs);
  const rows = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.status, "pending"), lt(knowledgeSources.updatedAt, cutoff)))
    .orderBy(asc(knowledgeSources.updatedAt), asc(knowledgeSources.id))
    .limit(limit);

  return rows.map((row) => row.id);
}

export async function touchPendingSources(
  ids: string[],
  db: DbExecutor = getDb(),
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  await db
    .update(knowledgeSources)
    .set({ updatedAt: sql`now()` })
    .where(and(inArray(knowledgeSources.id, ids), eq(knowledgeSources.status, "pending")));
}

export interface StuckPendingSummary {
  count: number;
  oldestAgeMs: number;
}

export async function summarizeStuckPendingSources(
  olderThanMs: number,
  db: DbExecutor = getDb(),
): Promise<StuckPendingSummary> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const [row] = await db
    .select({ total: count(), oldest: min(knowledgeSources.createdAt) })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.status, "pending"), lt(knowledgeSources.createdAt, cutoff)));

  const total = Number(row?.total ?? 0);

  return {
    count: total,
    oldestAgeMs: row?.oldest ? Date.now() - new Date(row.oldest).getTime() : 0,
  };
}
