import { sql } from "drizzle-orm";
import { getDb, type Db } from "../db/client.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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

/**
 * The single-entity counterpart to `withMergeLock` — for a write that CREATES
 * a child under one entity rather than absorbing one entity into another.
 * Deliberately derives its advisory lock id the same way (`hashtext(id)`), so
 * it shares one lock space with `withMergeLock`: a create against a subject
 * that a merge currently holds (as either its target or its source) waits for
 * that merge to commit instead of interleaving with it.
 *
 * That is what closes the window between a merge's reassignment step and its
 * delete step — the child insert can no longer slip in between and end up
 * attached to a row that is about to disappear. As with `withMergeLock`, the
 * caller's `run` is responsible for re-reading its own parent INSIDE the
 * transaction and deciding what a vanished parent means, since only then is
 * the read serialized against the merge.
 */
export async function withSubjectLock<T>(
  subjectId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${subjectId})::bigint)`);

    return run(tx);
  });
}

/**
 * The pair-locking half of `withMergeLock`'s preamble (sorted advisory-lock
 * pair, so two callers racing on the same pair in opposite directions never
 * deadlock), without `withMergeLock`'s self-merge guard — for callers where
 * the two ids being equal is a legitimate case to run, not one to reject.
 * `moveCurriculumToSubject` uses this to lock a curriculum's target subject
 * together with whatever its CURRENT subject turns out to be once that is
 * known inside the transaction, rather than a pre-transaction peek that a
 * concurrent write could have already made stale.
 */
export async function withPairLockAllowingEqual<T>(
  idA: string,
  idB: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const ids = idA === idB ? [idA] : [idA, idB].sort();

    for (const id of ids) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id})::bigint)`);
    }

    return run(tx);
  });
}
