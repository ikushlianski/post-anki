import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { llmCallEvents } from "../db/schema.js";

export interface ChatUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getChatUsageTotals(op: string, now: Date = new Date()): Promise<ChatUsageTotals> {
  const [row] = await getDb()
    .select({
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${llmCallEvents.promptTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${llmCallEvents.completionTokens}), 0)::int`,
    })
    .from(llmCallEvents)
    .where(and(eq(llmCallEvents.op, op), gte(llmCallEvents.createdAt, utcDayStart(now))));

  return {
    calls: row?.calls ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
  };
}
