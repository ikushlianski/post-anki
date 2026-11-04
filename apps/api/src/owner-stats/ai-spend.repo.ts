import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { llmCallEvents } from "../db/schema.js";

export interface AiSpendRow {
  date: string;
  agentKey: string;
  purpose: string | null;
  modelId: string | null;
  calls: number;
  priceableCalls: number;
  promptTokens: number;
  completionTokens: number;
  unpricedTokens: number;
}

export interface AiSpendQuery {
  tz: string;
  days: number;
  now: Date;
}

export async function readAiSpendRows(query: AiSpendQuery, db: DbExecutor = getDb()): Promise<AiSpendRow[]> {
  const nowSql = sql`${query.now.toISOString()}::timestamptz`;
  const localCreated = sql`(${llmCallEvents.createdAt} at time zone ${query.tz})`;
  const day = sql<string>`to_char(${localCreated}::date, 'YYYY-MM-DD')`;
  const hasTokens = sql`(${llmCallEvents.promptTokens} is not null and ${llmCallEvents.completionTokens} is not null)`;
  const since = sql`${llmCallEvents.createdAt} >= (((${nowSql} at time zone ${query.tz})::date - ${query.days - 1}::int)::timestamp at time zone ${query.tz})`;

  return db
    .select({
      date: day,
      agentKey: llmCallEvents.agentKey,
      purpose: llmCallEvents.purpose,
      modelId: llmCallEvents.modelId,
      calls: sql<number>`count(*)`.mapWith(Number),
      priceableCalls: sql<number>`count(*) filter (where ${hasTokens})`.mapWith(Number),
      promptTokens: sql<number>`coalesce(sum(${llmCallEvents.promptTokens}) filter (where ${hasTokens}), 0)`.mapWith(Number),
      completionTokens: sql<number>`coalesce(sum(${llmCallEvents.completionTokens}) filter (where ${hasTokens}), 0)`.mapWith(Number),
      unpricedTokens: sql<number>`coalesce(sum(coalesce(${llmCallEvents.totalTokens}, coalesce(${llmCallEvents.promptTokens}, 0) + coalesce(${llmCallEvents.completionTokens}, 0))) filter (where not ${hasTokens}), 0)`.mapWith(Number),
    })
    .from(llmCallEvents)
    .where(since)
    .groupBy(sql`1`, llmCallEvents.agentKey, llmCallEvents.purpose, llmCallEvents.modelId)
    .orderBy(sql`1`);
}
