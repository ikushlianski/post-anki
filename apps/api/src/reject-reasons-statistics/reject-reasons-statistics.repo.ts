import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions, knowledgeBitFeedback } from "../db/schema.js";

export interface RawRejectReasonRow {
  reasonCode: string | null;
  subjectId?: string | null;
  count: number;
}

export async function readRejectReasonRows(db: DbExecutor = getDb()): Promise<RawRejectReasonRow[]> {
  const result = await db.execute(sql`
    select reason_code as "reasonCode", subject_id as "subjectId", count(*)::int as "count"
    from (
      select ${cardTriageDecisions.reasonCode} as reason_code, ${cardTriageDecisions.subjectId} as subject_id
      from ${cardTriageDecisions}
      where ${cardTriageDecisions.verdict} = 'rejected' and ${cardTriageDecisions.undoneAt} is null
      union all
      select ${knowledgeBitFeedback.reasonCode} as reason_code, ${knowledgeBitFeedback.subjectId} as subject_id
      from ${knowledgeBitFeedback}
      where ${knowledgeBitFeedback.verdict} = 'rejected'
        and ${knowledgeBitFeedback.id} not in (
          select ${cardTriageDecisions.feedbackId} from ${cardTriageDecisions}
          where ${cardTriageDecisions.feedbackId} is not null
        )
    ) rejected
    group by reason_code, subject_id
  `);

  return result.rows as unknown as RawRejectReasonRow[];
}
