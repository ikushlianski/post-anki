import type pg from "pg";
import { getDb } from "../db/client.js";
import { log } from "../shared/log.js";

export const MINING_RUN_LOCK_KEY = "7301552001";

export type MiningLockResult<T> = { acquired: true; value: T } | { acquired: false };

export async function withMiningRunLock<T>(run: () => Promise<T>): Promise<MiningLockResult<T>> {
  const client = await (getDb().$client as pg.Pool).connect();
  let destroy = false;

  try {
    const res = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS locked", [
      MINING_RUN_LOCK_KEY,
    ]);

    if (!res.rows[0]?.locked) {
      return { acquired: false };
    }

    try {
      return { acquired: true, value: await run() };
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [MINING_RUN_LOCK_KEY]);
      } catch (err) {
        destroy = true;
        log.warn({ err }, "card_synthesis_mining_unlock_failed");
      }
    }
  } finally {
    client.release(destroy);
  }
}
