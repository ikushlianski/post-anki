import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { motivationGoalDays } from "../db/schema.js";

export async function recordGoalDay(
  day: string,
  reviews: number,
  threshold: number,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .insert(motivationGoalDays)
    .values({ day, reviews, threshold })
    .onConflictDoUpdate({ target: motivationGoalDays.day, set: { reviews: sql`greatest(${motivationGoalDays.reviews}, ${reviews})` } });
}

export async function countGoalDays(db: DbExecutor = getDb()): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(motivationGoalDays);

  return row?.total ?? 0;
}
