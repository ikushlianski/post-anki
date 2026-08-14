import { and, asc, eq } from "drizzle-orm";
import type {
  GapDueForResurfaceItem,
  GapsDueForResurfaceResponse,
  ResurfaceKind,
  TriageAction,
  TriageGapResultDto,
} from "@post-anki/shared";
import {
  applyAutoDefer,
  applyTriageAction,
  isAutoDeferDue,
  isDismissedCheckinDue,
  isResurfaceDue,
} from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, gaps, subjects, topics } from "../db/schema.js";
import { rowToGap } from "./gap.repo.js";

// The tool (subject) name a gap belongs to, resolved via the same
// gap -> topic -> curriculum -> subject join gap-mastery.repo.ts's
// listMasteryTrackedGapsAcrossSubjects already uses. Needed so the bot's tap
// confirmation ("Noted — {Tool}: ...") and the resurfacing/check-in message
// can both show the exact same name without a second round trip.
async function resolveGapTool(gapId: string, db: DbExecutor): Promise<string> {
  const rows = await db
    .select({ tool: subjects.name })
    .from(gaps)
    .innerJoin(topics, eq(gaps.topicId, topics.id))
    .innerJoin(curricula, eq(topics.curriculumId, curricula.id))
    .innerJoin(subjects, eq(curricula.subjectId, subjects.id))
    .where(eq(gaps.id, gapId));

  return rows[0]?.tool ?? "Unknown";
}

// Locked transaction wrapper (issue #29) — mirrors gap-mastery.repo.ts's
// `SELECT ... FOR UPDATE` convention: the row is locked, re-read inside the
// transaction, transitioned by the pure applyTriageAction, and only written
// back when it actually changed. Two concurrent taps on the same gap
// serialize through this lock into one real transition and one true no-op
// (SCENARIO 9 / AC30) instead of a lost update.
export async function triageGapLocked(
  gapId: string,
  action: TriageAction,
  now: string,
): Promise<TriageGapResultDto | null> {
  return getDb().transaction(async (tx) => {
    const rows = await tx.select().from(gaps).where(eq(gaps.id, gapId)).for("update");
    const row = rows[0];

    if (!row) {
      return null;
    }

    const { gap: updated, changed } = applyTriageAction(rowToGap(row), action, now);

    if (changed) {
      await tx
        .update(gaps)
        .set({
          triageState: updated.triageState,
          triagedAt: updated.triagedAt ? new Date(updated.triagedAt) : null,
          deferredUntil: updated.deferredUntil ? new Date(updated.deferredUntil) : null,
          deferralCount: updated.deferralCount,
          dismissedAt: updated.dismissedAt ? new Date(updated.dismissedAt) : null,
          dismissedCheckinSentAt: updated.dismissedCheckinSentAt
            ? new Date(updated.dismissedCheckinSentAt)
            : null,
          untriagedSince: new Date(updated.untriagedSince),
          autoDeferredAt: updated.autoDeferredAt ? new Date(updated.autoDeferredAt) : null,
        })
        .where(eq(gaps.id, gapId));
    }

    const tool = await resolveGapTool(gapId, tx);

    return { gap: updated, changed, tool };
  });
}

// Read-only (AC18) — calling this twice with no intervening mark-resurfaced
// call returns the identical candidate set both times. Candidates are
// narrowed by `triageState` at the SQL layer, then the exact boundary logic
// unit-tested in isolation (gap.ts's isResurfaceDue/isDismissedCheckinDue)
// decides due-ness, so there is only one place that encodes "is it due yet."
export async function listGapsDueForResurface(now: string): Promise<GapsDueForResurfaceResponse> {
  const db = getDb();

  const [deferredCandidates, dismissedCandidates] = await Promise.all([
    db
      .select({ gap: gaps, tool: subjects.name })
      .from(gaps)
      .innerJoin(topics, eq(gaps.topicId, topics.id))
      .innerJoin(curricula, eq(topics.curriculumId, curricula.id))
      .innerJoin(subjects, eq(curricula.subjectId, subjects.id))
      .where(eq(gaps.triageState, "user_deferred")),
    db
      .select({ gap: gaps, tool: subjects.name })
      .from(gaps)
      .innerJoin(topics, eq(gaps.topicId, topics.id))
      .innerJoin(curricula, eq(topics.curriculumId, curricula.id))
      .innerJoin(subjects, eq(curricula.subjectId, subjects.id))
      .where(eq(gaps.triageState, "dismissed")),
  ]);

  const userDeferredDue: GapDueForResurfaceItem[] = deferredCandidates
    .filter((row) =>
      isResurfaceDue(row.gap.deferredUntil ? row.gap.deferredUntil.toISOString() : null, now),
    )
    .map((row) => ({ gap: rowToGap(row.gap), tool: row.tool }));

  const dismissedCheckinDue: GapDueForResurfaceItem[] = dismissedCandidates
    .filter((row) =>
      isDismissedCheckinDue(
        row.gap.dismissedAt ? row.gap.dismissedAt.toISOString() : null,
        row.gap.dismissedCheckinSentAt ? row.gap.dismissedCheckinSentAt.toISOString() : null,
        now,
      ),
    )
    .map((row) => ({ gap: rowToGap(row.gap), tool: row.tool }));

  return { userDeferredDue, dismissedCheckinDue };
}

// Only called by the bot AFTER a Telegram send has already succeeded — see
// server.ts's POST /gap-resurface. `deferral-expired` resets the gap back
// to `untriaged` (its next tap starts a clean transition); `dismissed-checkin`
// only stamps the one-time-sent flag, leaving `triageState` at `dismissed`.
export async function markGapResurfaced(
  gapId: string,
  kind: ResurfaceKind,
  now: string,
): Promise<void> {
  const db = getDb();

  if (kind === "deferral-expired") {
    await db
      .update(gaps)
      .set({
        triageState: "untriaged",
        deferredUntil: null,
        triagedAt: new Date(now),
        // Issue #33 — a 60-day deferral expiring is itself a fresh return to
        // untriaged. Without resetting the clock here, the gap's stale,
        // 60-day-old `untriaged_since` would let the very next morning's
        // sweep auto-defer it immediately, contradicting the resurfacing UX
        // #29 shipped (the highest-value regression this story guards).
        untriagedSince: new Date(now),
      })
      .where(eq(gaps.id, gapId));

    return;
  }

  await db
    .update(gaps)
    .set({ dismissedCheckinSentAt: new Date(now) })
    .where(eq(gaps.id, gapId));
}

// Bounds the scheduler's attemptDeadline (not correctness) — a capped run is
// picked up by the next day's sweep. Exported so the integration test can
// seed exactly SWEEP_BATCH_LIMIT + 5 rows instead of hardcoding the number.
export const SWEEP_BATCH_LIMIT = 500;

// autoDeferSweepJob's one write path (issue #33). Narrows candidates in SQL
// (triageState = untriaged), decides due-ness in the unit-tested pure
// predicate (isAutoDeferDue) — same "narrow in SQL, decide in the pure
// function" split as listGapsDueForResurface above. `orderBy(asc(untriagedSince))`
// BEFORE `.limit()` is load-bearing, not cosmetic: without it, a backlog
// larger than the cap could return the same not-yet-due rows on every run
// while genuinely due gaps are never reached — oldest-first guarantees due
// gaps are always in the batch first.
export async function sweepAutoDeferredGaps(
  now: string,
): Promise<{ autoDeferred: number; capped: boolean }> {
  const db = getDb();

  const candidates = await db
    .select()
    .from(gaps)
    .where(eq(gaps.triageState, "untriaged"))
    .orderBy(asc(gaps.untriagedSince))
    .limit(SWEEP_BATCH_LIMIT);

  const due = candidates.filter((row) => isAutoDeferDue(rowToGap(row), now));

  let autoDeferred = 0;

  for (const row of due) {
    const changed = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(gaps)
        .where(and(eq(gaps.id, row.id), eq(gaps.triageState, "untriaged")))
        .for("update");
      const locked = rows[0];

      if (!locked) {
        return false;
      }

      const { gap: updated, changed: didChange } = applyAutoDefer(rowToGap(locked), now);

      if (didChange) {
        await tx
          .update(gaps)
          .set({ triageState: updated.triageState, autoDeferredAt: new Date(updated.autoDeferredAt!) })
          .where(eq(gaps.id, row.id));
      }

      return didChange;
    });

    if (changed) {
      autoDeferred += 1;
    }
  }

  return { autoDeferred, capped: candidates.length === SWEEP_BATCH_LIMIT };
}
