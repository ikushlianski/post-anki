import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { llmCallEvents } from "../db/schema.js";

export interface FeatureUsage {
  dayCostUsd: number;
  dayTokens: number;
  monthCostUsd: number;
  monthTokens: number;
  dayUnmeteredFailures: number;
  monthUnmeteredFailures: number;
}

export interface FeatureCallRow {
  outcome: "ok" | "failed";
  createdAt: Date;
}

export interface FeatureLedger {
  sumUsage(opPrefix: string, dayStart: Date, monthStart: Date): Promise<FeatureUsage>;
  listRecentSteps(stepOp: string, limit: number): Promise<FeatureCallRow[]>;
}

function likePrefix(opPrefix: string): string {
  return `${opPrefix.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function sumFeatureUsage(
  opPrefix: string,
  dayStart: Date,
  monthStart: Date,
): Promise<FeatureUsage> {
  const day = sql`${llmCallEvents.createdAt} >= ${dayStart.toISOString()}::timestamptz`;
  const unmetered = sql`${llmCallEvents.outcome} = 'failed' and ${llmCallEvents.costUsd} is null and ${llmCallEvents.totalTokens} is null`;
  const [row] = await getDb()
    .select({
      dayCost: sql<string>`coalesce(sum(${llmCallEvents.costUsd}) filter (where ${day}), 0)`,
      dayTokens: sql<string>`coalesce(sum(${llmCallEvents.totalTokens}) filter (where ${day}), 0)`,
      monthCost: sql<string>`coalesce(sum(${llmCallEvents.costUsd}), 0)`,
      monthTokens: sql<string>`coalesce(sum(${llmCallEvents.totalTokens}), 0)`,
      dayUnmetered: sql<string>`count(*) filter (where ${day} and ${unmetered})`,
      monthUnmetered: sql<string>`count(*) filter (where ${unmetered})`,
    })
    .from(llmCallEvents)
    .where(
      and(
        like(llmCallEvents.op, likePrefix(opPrefix)),
        inArray(llmCallEvents.outcome, ["ok", "failed"]),
        sql`${llmCallEvents.createdAt} >= ${monthStart.toISOString()}::timestamptz`,
      ),
    );

  return {
    dayCostUsd: Number(row?.dayCost ?? 0),
    dayTokens: Number(row?.dayTokens ?? 0),
    monthCostUsd: Number(row?.monthCost ?? 0),
    monthTokens: Number(row?.monthTokens ?? 0),
    dayUnmeteredFailures: Number(row?.dayUnmetered ?? 0),
    monthUnmeteredFailures: Number(row?.monthUnmetered ?? 0),
  };
}

export async function listRecentFeatureSteps(
  stepOp: string,
  limit: number,
): Promise<FeatureCallRow[]> {
  const rows = await getDb()
    .select({ outcome: llmCallEvents.outcome, createdAt: llmCallEvents.createdAt })
    .from(llmCallEvents)
    .where(
      and(
        eq(llmCallEvents.op, stepOp),
        inArray(llmCallEvents.outcome, ["ok", "failed"]),
      ),
    )
    .orderBy(desc(llmCallEvents.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    outcome: row.outcome === "ok" ? "ok" : "failed",
    createdAt: row.createdAt,
  }));
}

export const featureLedger: FeatureLedger = {
  sumUsage: sumFeatureUsage,
  listRecentSteps: listRecentFeatureSteps,
};
