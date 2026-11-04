import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions } from "../db/schema.js";

export interface RawWeeklyDecisionRow {
  weekStart: string;
  rejected: boolean;
  reasonCode: string | null;
  count: number;
}

export async function readWeeklyDecisionRows(
  since: Date,
  db: DbExecutor = getDb(),
): Promise<RawWeeklyDecisionRow[]> {
  const result = await db.execute(sql`
    select
      to_char(date_trunc('week', ${cardTriageDecisions.decidedAt} at time zone 'UTC'), 'YYYY-MM-DD') as "weekStart",
      (${cardTriageDecisions.verdict} = 'rejected') as "rejected",
      case when ${cardTriageDecisions.verdict} = 'rejected' then ${cardTriageDecisions.reasonCode} end as "reasonCode",
      count(*)::int as "count"
    from ${cardTriageDecisions}
    where ${cardTriageDecisions.undoneAt} is null
      and ${cardTriageDecisions.decidedAt} >= ${since.toISOString()}::timestamptz
    group by 1, 2, 3
  `);

  return result.rows as unknown as RawWeeklyDecisionRow[];
}
