import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";

export interface TriageByModelRow {
  modelId: string;
  kept: number;
  rejected: number;
}

export interface TriageByModelQuery {
  tz: string;
  days: number;
  now: Date;
}

export async function readTriageByModel(
  query: TriageByModelQuery,
  db: DbExecutor = getDb(),
): Promise<TriageByModelRow[]> {
  const nowSql = sql`${query.now.toISOString()}::timestamptz`;
  const since = sql`(((${nowSql} at time zone ${query.tz})::date - ${query.days - 1}::int)::timestamp at time zone ${query.tz})`;

  const result = await db.execute<{ model_id: string; kept: string; rejected: string }>(sql`
    select m.model_id,
      count(*) filter (where d.verdict = 'approved') as kept,
      count(*) filter (where d.verdict = 'rejected') as rejected
    from card_triage_decisions d
    cross join lateral jsonb_array_elements_text(d.fusion_model_ids) as m(model_id)
    where d.undone_at is null
      and d.fusion_model_ids is not null
      and d.decided_at >= ${since}
    group by m.model_id
    order by count(*) desc, m.model_id
  `);

  return result.rows.map((row) => ({
    modelId: row.model_id,
    kept: Number(row.kept),
    rejected: Number(row.rejected),
  }));
}
