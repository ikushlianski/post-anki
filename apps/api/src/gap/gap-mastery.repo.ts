import { asc, eq, inArray, sql } from "drizzle-orm";
import type { DepthLevel } from "@post-anki/shared";
import {
  applyAttemptToMasteryEntry,
  computeGapAttemptIsAdjacent,
  matchExistingGapByLabel,
  type MasteryEntryState,
  type MasteryStatus,
} from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, gaps, gapMastery, subjects, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { insertDiscoveredGaps } from "./gap.repo.js";

// Analogous to phrase-bank's RECYCLE_OFFSET, but 10 (matching
// REPLENISH_BATCH_SIZE — one full generation event's worth of questions),
// not 3 — the anti-spam guard against re-serving a struggling gap into the
// very next batch (spec.md Decision 4). This is NOT what proves "resurfaces
// in a later session" — session-identity gating (computeGapAttemptIsAdjacent
// below) is what proves that; this offset only governs question-cadence
// re-selection.
const GAP_RECYCLE_OFFSET = 10;

export type GapMasteryRow = typeof gapMastery.$inferSelect;

export interface GapMasteryEntry extends MasteryEntryState {
  gapId: string;
  lastCorrectSessionId: string | null;
}

function zeroGapMasteryEntry(gapId: string): GapMasteryEntry {
  return {
    gapId,
    status: "new",
    masteryStage: 0,
    correctCountInCycle: 0,
    incorrectCountInCycle: 0,
    lastCorrectAtSequence: null,
    scheduledForSequence: null,
    lastCorrectSessionId: null,
  };
}

function rowToGapMasteryEntry(row: GapMasteryRow): GapMasteryEntry {
  return {
    gapId: row.gapId,
    status: row.status as MasteryStatus,
    masteryStage: row.masteryStage,
    correctCountInCycle: row.correctCountInCycle,
    incorrectCountInCycle: row.incorrectCountInCycle,
    lastCorrectAtSequence: row.lastCorrectAtSequence,
    scheduledForSequence: row.scheduledForSequence,
    lastCorrectSessionId: row.lastCorrectSessionId,
  };
}

// SELECT ... FOR UPDATE, ordered by gap_id — mirrors
// getPhraseBankEntriesByIdsForUpdate's precedent (ordering guards against
// deadlock when more than one row is ever touched in one call; today this
// call site only ever locks a single gap_id, so ordering is a defensive
// floor rather than a live requirement).
export async function getGapMasteryRowsForUpdate(
  gapIds: string[],
  db: DbExecutor,
): Promise<GapMasteryRow[]> {
  if (gapIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(gapMastery)
    .where(inArray(gapMastery.gapId, gapIds))
    .orderBy(asc(gapMastery.gapId))
    .for("update");
}

export async function deleteGapMasteryForGapIds(
  gapIds: string[],
  db: DbExecutor,
): Promise<void> {
  if (gapIds.length === 0) {
    return;
  }

  await db.delete(gapMastery).where(inArray(gapMastery.gapId, gapIds));
}

export async function listGapMasteryForGapIds(
  gapIds: string[],
): Promise<Map<string, GapMasteryRow>> {
  if (gapIds.length === 0) {
    return new Map();
  }

  const rows = await getDb().select().from(gapMastery).where(inArray(gapMastery.gapId, gapIds));

  return new Map(rows.map((row) => [row.gapId, row]));
}

export async function getTopicGapMasterySequenceNumbers(
  topicIds: string[],
): Promise<Map<string, number>> {
  if (topicIds.length === 0) {
    return new Map();
  }

  const rows = await getDb()
    .select({ id: topics.id, gapMasterySequenceNumber: topics.gapMasterySequenceNumber })
    .from(topics)
    .where(inArray(topics.id, topicIds));

  return new Map(rows.map((row) => [row.id, row.gapMasterySequenceNumber]));
}

export interface GapAttemptInput {
  topicId: string;
  topicDepth: DepthLevel;
  gapId: string | null;
  gapLabel: string | null;
  currentProbeSessionId: string;
  correct: boolean;
  now: string;
}

export interface GapAttemptOutcome {
  gapId: string;
  masteryStatus: MasteryStatus;
  masteryStage: number;
  justMastered: boolean;
}

/**
 * The one write path for a gap-tagged probe-session quiz answer
 * (architecture.md's Concurrency design). Returns null when the question
 * carried no gap signal at all (no gapId, no gapLabel) — the existing
 * "grade only, no gap side-effect" behavior, unchanged.
 *
 * Lock discipline: `pg_advisory_xact_lock(hashtext(topicId)::bigint)`
 * acquired BEFORE any `SELECT ... FOR UPDATE` on gap_mastery, inside one
 * transaction that also matches-or-creates the gap (SCENARIO 2) and
 * increments `topics.gap_mastery_sequence_number` — every DB call in this
 * body takes `tx` explicitly, matching phrase-bank's own precedent
 * (generate-phrase-batch.orchestrator.ts) for a locked write path.
 */
export async function applyGapMasteryAttempt(
  input: GapAttemptInput,
): Promise<GapAttemptOutcome | null> {
  if (!input.gapId && !input.gapLabel) {
    return null;
  }

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.topicId})::bigint)`);

    let gapId = input.gapId;

    if (!gapId) {
      const topicGapRows = await tx
        .select({ id: gaps.id, label: gaps.label })
        .from(gaps)
        .where(eq(gaps.topicId, input.topicId));
      const matched = matchExistingGapByLabel(topicGapRows, input.gapLabel!);

      if (matched) {
        gapId = matched;
      } else {
        const [created] = await insertDiscoveredGaps(
          input.topicId,
          [{ label: input.gapLabel!, depth: input.topicDepth, concern: null }],
          input.now,
          tx,
        );
        gapId = created!.id;
      }
    }

    const existingRows = await getGapMasteryRowsForUpdate([gapId], tx);
    const existing = existingRows[0];
    const currentEntry = existing ? rowToGapMasteryEntry(existing) : zeroGapMasteryEntry(gapId);

    if (currentEntry.status === "mastered") {
      // "Mastered entries don't regress" — ported unchanged from
      // applyAttemptToMasteryEntry's own no-op branch. Neither gap_mastery
      // nor gaps.state is written at all here, and the topic's counter is
      // NOT incremented — a mastered gap is done, it no longer participates
      // in the anti-spam/recycling schedule.
      return {
        gapId,
        masteryStatus: "mastered",
        masteryStage: currentEntry.masteryStage,
        justMastered: false,
      };
    }

    const [counterRow] = await tx
      .update(topics)
      .set({ gapMasterySequenceNumber: sql`${topics.gapMasterySequenceNumber} + 1` })
      .where(eq(topics.id, input.topicId))
      .returning({ gapMasterySequenceNumber: topics.gapMasterySequenceNumber });

    const sequenceNumber = counterRow!.gapMasterySequenceNumber;

    const isAdjacent = computeGapAttemptIsAdjacent(
      input.currentProbeSessionId,
      currentEntry.lastCorrectSessionId,
    );

    const result = applyAttemptToMasteryEntry(
      currentEntry,
      { sequenceNumber, correct: input.correct, isAdjacent },
      GAP_RECYCLE_OFFSET,
    );

    const nextLastCorrectSessionId = input.correct
      ? input.currentProbeSessionId
      : currentEntry.lastCorrectSessionId;

    const now = new Date(input.now);
    // currentEntry.status is already known not to be "mastered" here (the
    // early return above handles that case), so reaching "mastered" now is
    // always a fresh transition.
    const justMastered = result.entry.status === "mastered";

    const patch = {
      status: result.entry.status,
      masteryStage: result.entry.masteryStage,
      correctCountInCycle: result.entry.correctCountInCycle,
      incorrectCountInCycle: result.entry.incorrectCountInCycle,
      lastCorrectAtSequence: result.entry.lastCorrectAtSequence,
      scheduledForSequence: result.entry.scheduledForSequence,
      lastCorrectSessionId: nextLastCorrectSessionId,
      updatedAt: now,
      masteredAt: justMastered ? now : (existing?.masteredAt ?? null),
    };

    if (existing) {
      await tx.update(gapMastery).set(patch).where(eq(gapMastery.gapId, gapId));
    } else {
      await tx.insert(gapMastery).values({ id: newId("gapmastery"), gapId, ...patch, createdAt: now });
    }

    if (justMastered) {
      await tx.update(gaps).set({ state: "covered", lastEvaluatedAt: now }).where(eq(gaps.id, gapId));
    }

    return {
      gapId,
      masteryStatus: result.entry.status,
      masteryStage: result.entry.masteryStage,
      justMastered,
    };
  });
}

export interface MasteryTrackedGapAcrossSubjects {
  label: string;
  subjectId: string;
  subjectName: string;
  status: MasteryStatus;
}

/**
 * Feeds the cross-cutting nudge (spec.md Decision 7, SCENARIO 7) — an INNER
 * JOIN against gap_mastery, so every row returned is, by construction,
 * mastery-tracked (a plain Socratic-discovered `open` gap with no
 * gap_mastery row never appears here at all).
 */
export async function listMasteryTrackedGapsAcrossSubjects(): Promise<
  MasteryTrackedGapAcrossSubjects[]
> {
  const rows = await getDb()
    .select({
      label: gaps.label,
      status: gapMastery.status,
      subjectId: curricula.subjectId,
      subjectName: subjects.name,
    })
    .from(gapMastery)
    .innerJoin(gaps, eq(gapMastery.gapId, gaps.id))
    .innerJoin(topics, eq(gaps.topicId, topics.id))
    .innerJoin(curricula, eq(topics.curriculumId, curricula.id))
    .innerJoin(subjects, eq(curricula.subjectId, subjects.id));

  return rows.map((row) => ({
    label: row.label,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    status: row.status as MasteryStatus,
  }));
}
