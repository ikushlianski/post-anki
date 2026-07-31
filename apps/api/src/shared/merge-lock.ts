import { sql } from "drizzle-orm";
import { getDb, type Db } from "../db/client.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The shared locking preamble behind every "absorb source into target" merge
 * in this codebase (`mergeSubjects`, `mergeTags`, `mergeCurricula`) — the
 * self-merge guard, the sorted-pair advisory lock (sorted lexicographically
 * so two merges racing on the same pair of ids in opposite directions can
 * never deadlock each other), and opening the transaction, are byte-for-byte
 * identical across all three; what differs is entirely the reassignment body
 * each one runs once the lock is held, which this helper leaves untouched by
 * taking a callback.
 *
 * `run` is handed the open transaction and is responsible for its own
 * entity-specific re-read (closing the TOCTOU gap the same way a
 * pre-transaction read would leave open) and any entity-specific
 * preconditions (e.g. `kind_mismatch` for subjects, `different_subjects` /
 * `pending_structure_turn` for curricula) — this helper only ever adds
 * `self_merge` to whatever error union `run`'s own return type already
 * defines.
 */
export async function withMergeLock<T>(
  targetId: string,
  sourceId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T | { error: "self_merge" }> {
  if (targetId === sourceId) {
    return { error: "self_merge" };
  }

  return getDb().transaction(async (tx) => {
    const [firstLockId, secondLockId] = [targetId, sourceId].sort();

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${firstLockId})::bigint)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${secondLockId})::bigint)`);

    return run(tx);
  });
}
