import { eq } from "drizzle-orm";
import {
  DEFAULT_REST_DAYS_PER_MONTH,
  DEFAULT_STREAK_MIN_REVIEWS,
  type MotivationSettings,
  type UpdateMotivationSettingsInput,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { motivationSettings } from "../db/schema.js";

const SINGLETON_ID = "singleton";
const FALLBACK_TIME_ZONE = "UTC";

function toSettings(row: typeof motivationSettings.$inferSelect | undefined): MotivationSettings {
  return {
    timeZone: row?.timeZone ?? FALLBACK_TIME_ZONE,
    timeZoneConfigured: row?.timeZone != null,
    streakMinReviews: row?.streakMinReviews ?? DEFAULT_STREAK_MIN_REVIEWS,
    restDaysPerMonth: row?.restDaysPerMonth ?? DEFAULT_REST_DAYS_PER_MONTH,
  };
}

export async function readMotivationSettings(db: DbExecutor = getDb()): Promise<MotivationSettings> {
  const [row] = await db.select().from(motivationSettings).where(eq(motivationSettings.id, SINGLETON_ID));

  return toSettings(row);
}

export async function writeMotivationSettings(
  patch: UpdateMotivationSettingsInput,
  db: DbExecutor = getDb(),
): Promise<MotivationSettings> {
  await db
    .insert(motivationSettings)
    .values({ id: SINGLETON_ID, ...patch })
    .onConflictDoUpdate({ target: motivationSettings.id, set: patch });

  return readMotivationSettings(db);
}
