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

export async function readOrCreateStreak(): Promise<Streak> {
  const db = getDb();
  const existing = (
    await db.select().from(userStreaks).where(eq(userStreaks.id, SINGLETON_ID))
  )[0];

  if (existing) {
    return rowToStreak(existing);
  }

  const row = {
    id: SINGLETON_ID,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
  };

  await db.insert(userStreaks).values(row);

  return rowToStreak(row as typeof userStreaks.$inferSelect);
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
