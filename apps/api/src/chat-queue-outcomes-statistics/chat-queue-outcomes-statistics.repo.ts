import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";

export interface RawChatQueueOutcomeRow {
  accepted: number;
  rejected: number;
  waiting: number;
  snoozed: number;
}

export async function readChatQueueOutcomeRow(
  since: Date,
  db: DbExecutor = getDb(),
): Promise<RawChatQueueOutcomeRow> {
  const result = await db.execute(sql`
    select
      count(*) filter (where ${knowledgeBits.approvalState} = 'approved')::int as "accepted",
      count(*) filter (where ${knowledgeBits.approvalState} = 'rejected')::int as "rejected",
      count(*) filter (
        where ${knowledgeBits.approvalState} = 'chat'
          and ${knowledgeSources.id} is not null
          and (${knowledgeBits.chatSnoozedUntil} is null or ${knowledgeBits.chatSnoozedUntil} <= now())
      )::int as "waiting",
      count(*) filter (
        where ${knowledgeBits.approvalState} = 'chat'
          and ${knowledgeSources.id} is not null
          and ${knowledgeBits.chatSnoozedUntil} > now()
      )::int as "snoozed"
    from ${knowledgeBits}
    left join ${knowledgeSources} on ${knowledgeSources.id} = ${knowledgeBits.knowledgeSourceId}
    where ${knowledgeBits.chatAt} >= ${since.toISOString()}::timestamptz
  `);

  return result.rows[0] as unknown as RawChatQueueOutcomeRow;
}
