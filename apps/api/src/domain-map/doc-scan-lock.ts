import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";

// One global key, because the watermark this protects
// (tracked_tool_scan_state) is itself keyed by tool_key alone, with no
// subject column — so per-subject locking would not serialize the thing
// that actually races.
const DOC_SCAN_LOCK_KEY = "doc-scan";

/**
 * The non-blocking counterpart to shared/merge-lock.ts's `withMergeLock` /
 * `withSubjectLock`, deliberately deriving its lock id the same way
 * (`hashtext(...)::bigint`) so it shares one advisory-lock space with them
 * rather than introducing a second locking mechanism.
 *
 * Two differences from those helpers, both forced by what a doc scan is:
 *
 * - `pg_TRY_advisory_xact_lock`, not the blocking form. A scan holds the
 *   lock across an LLM call, and `db/client.ts`'s pool is `max: 4` — a
 *   queue of blocked waiters would exhaust it. A caller that loses the lock
 *   is told so immediately and returns its own "nothing happened" result,
 *   which is the correct outcome anyway: a scan IS already running, and its
 *   suggestions will land.
 * - `run` is NOT handed the transaction. The transaction opened here exists
 *   only to scope the lock; the scan's own reads and writes go through the
 *   pool as usual. That costs one extra connection for the duration of a
 *   scan, and in exchange keeps the whole existing repo surface usable
 *   inside the critical section without threading a `tx` through it.
 *
 * Callers must keep everything network-bound that CAN be hoisted (the
 * tracked-tool fetches) outside `run`, so the held window is the
 * read-compare-write on the watermark plus the single agent call, not the
 * whole scan.
 */
export async function withDocScanLock<T>(
  run: () => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const result = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${DOC_SCAN_LOCK_KEY})::bigint) AS locked`,
    );

    if (!result.rows[0]?.locked) {
      return onBusy();
    }

    return run();
  });
}
