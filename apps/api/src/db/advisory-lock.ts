import type pg from "pg";
import { log } from "../shared/log.js";
import { getDb } from "./client.js";

export type AdvisoryLockResult<T> = { acquired: true; value: T } | { acquired: false };

export async function withAdvisoryLock<T>(
  key: string,
  run: () => Promise<T>,
  unlockFailedEvent: string,
): Promise<AdvisoryLockResult<T>> {
  const client = await (getDb().$client as pg.Pool).connect();
  let destroy = false;

  try {
    const res = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS locked", [key]);

    if (!res.rows[0]?.locked) {
      return { acquired: false };
    }

    try {
      return { acquired: true, value: await run() };
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]);
      } catch (err) {
        destroy = true;
        log.warn({ err }, unlockFailedEvent);
      }
    }
  } finally {
    client.release(destroy);
  }
}
