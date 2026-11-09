import { and, asc, eq, lt } from "drizzle-orm";
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
