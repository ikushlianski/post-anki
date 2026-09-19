import { eq } from "drizzle-orm";
import type { Streak } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { userStreaks } from "../db/schema.js";

const SINGLETON_ID = "singleton";

function rowToStreak(row: typeof userStreaks.$inferSelect): Streak {
  return {
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastActiveDate: row.lastActiveDate,
  };
}

async function readStreakRow(): Promise<typeof userStreaks.$inferSelect | undefined> {
  return (await getDb().select().from(userStreaks).where(eq(userStreaks.id, SINGLETON_ID)))[0];
}

export async function readOrCreateStreak(): Promise<Streak> {
  const existing = await readStreakRow();

  if (existing) {
    return rowToStreak(existing);
  }

  // Two first-ever callers can race here; the loser must read the winner's row, not throw.
  await getDb()
    .insert(userStreaks)
    .values({ id: SINGLETON_ID, currentStreak: 0, longestStreak: 0, lastActiveDate: null })
    .onConflictDoNothing({ target: userStreaks.id });

  const created = await readStreakRow();

  if (!created) {
    throw new Error("streak row missing after create");
  }

  return rowToStreak(created);
}

export async function writeStreak(streak: Streak): Promise<void> {
  const db = getDb();

  await db
    .insert(userStreaks)
    .values({ id: SINGLETON_ID, ...streak })
    .onConflictDoUpdate({
      target: userStreaks.id,
      set: {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastActiveDate: streak.lastActiveDate,
      },
    });
}
