import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions, knowledgeBitReviews } from "../db/schema.js";

export interface WeeklyWindowCounts {
  accepted: number;
  rejected: number;
  reviewed: number;
}

export async function readWindowCounts(
  from: Date,
  to: Date,
  db: DbExecutor = getDb(),
): Promise<WeeklyWindowCounts> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const result = await db.execute(sql`
    select
      (select count(*)::int from ${cardTriageDecisions}
        where ${cardTriageDecisions.verdict} = 'approved' and ${cardTriageDecisions.undoneAt} is null
          and ${cardTriageDecisions.decidedAt} >= ${fromIso}::timestamptz
          and ${cardTriageDecisions.decidedAt} < ${toIso}::timestamptz) as "accepted",
      (select count(*)::int from ${cardTriageDecisions}
        where ${cardTriageDecisions.verdict} = 'rejected' and ${cardTriageDecisions.undoneAt} is null
          and ${cardTriageDecisions.decidedAt} >= ${fromIso}::timestamptz
          and ${cardTriageDecisions.decidedAt} < ${toIso}::timestamptz) as "rejected",
      (select count(*)::int from ${knowledgeBitReviews}
        where ${knowledgeBitReviews.undoneAt} is null
          and ${knowledgeBitReviews.reviewedAt} >= ${fromIso}::timestamptz
          and ${knowledgeBitReviews.reviewedAt} < ${toIso}::timestamptz) as "reviewed"
  `);

  return result.rows[0] as unknown as WeeklyWindowCounts;
}

export interface TopRejectReasonRow {
  reason: string;
  count: number;
}

export async function readTopRejectReasons(
  from: Date,
  to: Date,
  limit = 3,
  db: DbExecutor = getDb(),
): Promise<TopRejectReasonRow[]> {
  const result = await db.execute(sql`
    select coalesce(${cardTriageDecisions.reasonCode}, 'unspecified') as "reason", count(*)::int as "count"
    from ${cardTriageDecisions}
    where ${cardTriageDecisions.verdict} = 'rejected' and ${cardTriageDecisions.undoneAt} is null
      and ${cardTriageDecisions.decidedAt} >= ${from.toISOString()}::timestamptz
      and ${cardTriageDecisions.decidedAt} < ${to.toISOString()}::timestamptz
    group by 1
    order by 2 desc, 1 asc
    limit ${limit}
  `);

  return result.rows as unknown as TopRejectReasonRow[];
}

export async function readRejectReasonCounts(
  reasons: string[],
  from: Date,
  to: Date,
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  if (reasons.length === 0) return new Map();

  const result = await db.execute(sql`
    select coalesce(${cardTriageDecisions.reasonCode}, 'unspecified') as "reason", count(*)::int as "count"
    from ${cardTriageDecisions}
    where ${cardTriageDecisions.verdict} = 'rejected' and ${cardTriageDecisions.undoneAt} is null
      and ${cardTriageDecisions.decidedAt} >= ${from.toISOString()}::timestamptz
      and ${cardTriageDecisions.decidedAt} < ${to.toISOString()}::timestamptz
      and coalesce(${cardTriageDecisions.reasonCode}, 'unspecified') in (${sql.join(
        reasons.map((reason) => sql`${reason}`),
        sql`, `,
      )})
    group by 1
  `);
  const rows = result.rows as unknown as TopRejectReasonRow[];

  return new Map(rows.map((row) => [row.reason, row.count]));
}
