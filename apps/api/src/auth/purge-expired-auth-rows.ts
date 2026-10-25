import { lt } from "drizzle-orm";
import { getDb, type Db } from "../db/client.js";
import { sessions, verifications } from "../db/schema.js";
import { log } from "../shared/log.js";

export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export async function purgeExpiredAuthRows(db: Db, now: Date = new Date()): Promise<void> {
  await db.delete(verifications).where(lt(verifications.expiresAt, now));
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}

export function createHourlyPurge(run: () => Promise<void>, clock: () => number = Date.now): () => void {
  let lastRunAt = Number.NEGATIVE_INFINITY;

  return () => {
    const now = clock();

    if (now - lastRunAt < PURGE_INTERVAL_MS) {
      return;
    }

    lastRunAt = now;
    run().catch((err: unknown) => log.warn({ err }, "auth_purge_failed"));
  };
}

export const purgeExpiredAuthRowsHourly = createHourlyPurge(() => purgeExpiredAuthRows(getDb()));
