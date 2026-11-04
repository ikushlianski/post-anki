import { eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { studyGoals } from "../db/schema.js";

const SINGLETON_ID = "singleton";

export async function readDailyReviewTarget(db: DbExecutor = getDb()): Promise<number | null> {
  const [row] = await db
    .select({ target: studyGoals.dailyReviewTarget })
    .from(studyGoals)
    .where(eq(studyGoals.id, SINGLETON_ID));

  return row?.target ?? null;
}

export async function writeDailyReviewTarget(target: number | null, db: DbExecutor = getDb()): Promise<void> {
  await db
    .insert(studyGoals)
    .values({ id: SINGLETON_ID, dailyReviewTarget: target })
    .onConflictDoUpdate({ target: studyGoals.id, set: { dailyReviewTarget: target } });
}
