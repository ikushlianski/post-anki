import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";

export interface RawNothingExtractedRow {
  weekStart: string;
  processed: number;
  nothingExtracted: number;
}

export async function readNothingExtractedRows(
  since: Date,
  db: DbExecutor = getDb(),
): Promise<RawNothingExtractedRow[]> {
  const result = await db.execute(sql`
    select
      to_char(date_trunc('week', coalesce(${knowledgeSources.nothingExtractedAt}, ${knowledgeSources.updatedAt}) at time zone 'UTC'), 'YYYY-MM-DD') as "weekStart",
      count(*)::int as "processed",
      (count(*) filter (where ${knowledgeSources.nothingExtractedAt} is not null))::int as "nothingExtracted"
    from ${knowledgeSources}
    where ${knowledgeSources.status} = 'bits_detected'
      and coalesce(${knowledgeSources.nothingExtractedAt}, ${knowledgeSources.updatedAt}) >= ${since.toISOString()}::timestamptz
    group by 1
  `);

  return result.rows as unknown as RawNothingExtractedRow[];
}
