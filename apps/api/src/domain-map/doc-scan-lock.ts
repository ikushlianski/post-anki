import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import type { Tx } from "../shared/merge-lock.js";

// One global key. The watermark this protects (tracked_tool_scan_state) is
// now keyed by (subject_id, tool_key), so a per-subject key WOULD serialize
// the right thing. It stays global anyway: a scan holds this lock across an
// LLM call with no timeout of its own, and `db/client.ts`'s pool is `max: 4`,
// so per-subject keys would let N subjects each pin a connection for the
// length of an agent round-trip while the other three clients (web, Telegram
// bot, Cloud Scheduler) still need one. The cost of keeping it global is that
// a manual "Scan now" for subject B during the scheduler's run on subject A
// returns empty instead of scanning; the scheduled run itself is sequential,
// so every subject still gets its own scan.
const DOC_SCAN_LOCK_KEY = "doc-scan";

/**
 * The non-blocking counterpart to shared/merge-lock.ts's `withMergeLock` /
 * `withSubjectLock`, deliberately deriving its lock id the same way
 * (`hashtext(...)::bigint`) so it shares one advisory-lock space with them
 * rather than introducing a second locking mechanism.
 *
 * One difference from those helpers, forced by what a doc scan is:
 * `pg_TRY_advisory_xact_lock`, not the blocking form. A scan holds the lock
 * across an LLM call, and `db/client.ts`'s pool is `max: 4` — a queue of
 * blocked waiters would exhaust it. A caller that loses the lock is told so
 * immediately and returns its own "nothing happened" result, which is the
 * correct outcome anyway: a scan IS already running, and its suggestions will
 * land.
 *
 * `run` IS handed the transaction, and must thread it through every read and
 * write it makes. The whole scan therefore costs exactly one pooled
 * connection: acquiring a second one while holding this one and the lock is
 * the pool-exhaustion hazard
 * docs/architecture/concurrency-and-verification-hardening/review.md names.
 * It also makes a scan's suggestion inserts and its watermark advance commit
 * together, so neither can survive without the other.
 *
 * Callers must keep everything network-bound that CAN be hoisted (the
 * tracked-tool fetches) outside `run`, so the held window is the
 * read-compare-write on the watermark plus the single agent call, not the
 * whole scan.
 */
export async function withDocScanLock<T>(
  run: (tx: Tx) => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const result = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${DOC_SCAN_LOCK_KEY})::bigint) AS locked`,
    );

    if (!result.rows[0]?.locked) {
      return onBusy();
    }

    return run(tx);
  });
}
