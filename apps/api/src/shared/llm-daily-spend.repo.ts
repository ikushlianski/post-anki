import { eq, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { llmDailySpend } from "../db/schema.js";

export async function readDailySpendUsd(day: string, db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ spentUsd: llmDailySpend.spentUsd })
    .from(llmDailySpend)
    .where(eq(llmDailySpend.day, day))
    .limit(1);

  return rows[0] ? Number(rows[0].spentUsd) : 0;
}

export async function addDailySpendUsd(
  day: string,
  costUsd: number,
  db: DbExecutor = getDb(),
): Promise<number> {
  const rows = await db
    .insert(llmDailySpend)
    .values({ day, spentUsd: costUsd.toFixed(6) })
    .onConflictDoUpdate({
      target: llmDailySpend.day,
      set: {
        spentUsd: sql`${llmDailySpend.spentUsd} + excluded.spent_usd`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ spentUsd: llmDailySpend.spentUsd });

  return Number(rows[0]?.spentUsd ?? costUsd);
}
