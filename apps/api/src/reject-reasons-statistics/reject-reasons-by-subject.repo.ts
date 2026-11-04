import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions, knowledgeBits, knowledgeSources, subjects } from "../db/schema.js";

export interface RawSubjectDecisionRow {
  subjectName: string;
  decided: number;
  rejected: number;
}

export async function readSubjectDecisionRows(db: DbExecutor = getDb()): Promise<RawSubjectDecisionRow[]> {
  const result = await db.execute(sql`
    select
      ${subjects.name} as "subjectName",
      count(*)::int as "decided",
      (count(*) filter (where ${cardTriageDecisions.verdict} = 'rejected'))::int as "rejected"
    from ${cardTriageDecisions}
    join ${knowledgeBits} on ${knowledgeBits.id} = ${cardTriageDecisions.knowledgeBitId}
    join ${knowledgeSources} on ${knowledgeSources.id} = ${knowledgeBits.knowledgeSourceId}
    join ${subjects} on ${subjects.id} = ${knowledgeSources.subjectId}
    where ${cardTriageDecisions.undoneAt} is null
    group by ${subjects.id}, ${subjects.name}
  `);

  return result.rows as unknown as RawSubjectDecisionRow[];
}
