import { eq } from "drizzle-orm";
import type {
  GapDueForResurfaceItem,
  GapsDueForResurfaceResponse,
  ResurfaceKind,
  TriageAction,
  TriageGapResultDto,
} from "@post-anki/shared";
import { applyTriageAction, isDismissedCheckinDue, isResurfaceDue } from "@post-anki/core";
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
      .set({ triageState: "untriaged", deferredUntil: null, triagedAt: new Date(now) })
      .where(eq(gaps.id, gapId));

    return;
  }

  await db
    .update(gaps)
    .set({ dismissedCheckinSentAt: new Date(now) })
    .where(eq(gaps.id, gapId));
}
