import { and, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { pickedVariants } from "../knowledge-bit/knowledge-bit-review-queue-picked.repo.js";

export interface PlanDayCounts {
  fresh: number;
  waiting: number;
}

export async function readPlanDayCounts(
  now: Date,
  db: DbExecutor,
): Promise<Map<string | null, PlanDayCounts>> {
  const picked = pickedVariants(undefined, now, db);
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const rows = await db
    .select({
      subjectId: picked.cardSubjectId,
      fresh: sql<number>`count(*) filter (where ${picked.scheduleBitId} is null)`.mapWith(Number),
      waiting: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql} and ${picked.phase} not in ('learning', 'relearning'))`.mapWith(Number),
    })
    .from(picked)
    .where(and(eq(picked.pickRank, 1)))
    .groupBy(picked.cardSubjectId);

  return new Map(rows.map((row) => [row.subjectId, { fresh: row.fresh, waiting: row.waiting }]));
}
