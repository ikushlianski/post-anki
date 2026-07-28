import { eq, inArray } from "drizzle-orm";
import type { Concern, DepthLevel, Gap, GapMasteryView } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { gaps, gapMastery } from "../db/schema.js";
import { newId } from "../shared/id.js";

export function rowToGapMasteryView(
  row: typeof gapMastery.$inferSelect | undefined,
): GapMasteryView | null {
  if (!row) {
    return null;
  }

  return {
    status: row.status as GapMasteryView["status"],
    masteryStage: row.masteryStage,
    correctCountInCycle: row.correctCountInCycle,
    incorrectCountInCycle: row.incorrectCountInCycle,
  };
}

// Display-precedence rule (spec.md Decision 2 addendum): every reader of
// `gaps` that surfaces them to the UI goes through this function (or
// listGapsForTopic below, which calls it), so a gap with a gap_mastery row
// always carries its mastery sub-object — the frontend then renders THAT
// status instead of falling back to `state` (see GapRow in topic-row.tsx).
// `state` itself is left completely untouched here: aggregate-math readers
// (gapMaturity/progressFromGaps) keep reading it with zero code changes.
export function rowToGap(
  row: typeof gaps.$inferSelect,
  masteryRow?: typeof gapMastery.$inferSelect,
): Gap {
  return {
    id: row.id,
    topicId: row.topicId,
    label: row.label,
    depth: row.depth as DepthLevel,
    origin: row.origin as Gap["origin"],
    state: row.state as Gap["state"],
    wanted: row.wanted,
    concern: (row.concern as Concern | null) ?? null,
    lastEvaluatedAt: row.lastEvaluatedAt
      ? row.lastEvaluatedAt.toISOString()
      : null,
    mastery: rowToGapMasteryView(masteryRow),
  };
}

export async function listGapsForTopic(topicId: string): Promise<Gap[]> {
  const db = getDb();
  const gapRows = await db.select().from(gaps).where(eq(gaps.topicId, topicId));

  if (gapRows.length === 0) {
    return [];
  }

  const masteryRows = await db
    .select()
    .from(gapMastery)
    .where(inArray(gapMastery.gapId, gapRows.map((g) => g.id)));
  const masteryByGapId = new Map(masteryRows.map((m) => [m.gapId, m]));

  return gapRows.map((row) => rowToGap(row, masteryByGapId.get(row.id)));
}

export async function persistGaps(updated: Gap[]): Promise<void> {
  const db = getDb();

  for (const gap of updated) {
    await db
      .update(gaps)
      .set({
        state: gap.state,
        wanted: gap.wanted,
        depth: gap.depth,
        lastEvaluatedAt: gap.lastEvaluatedAt
          ? new Date(gap.lastEvaluatedAt)
          : null,
      })
      .where(eq(gaps.id, gap.id));
  }
}

// `db` defaults to getDb() so every EXISTING call site (probe.service.ts's
// submitProbe) is completely unaffected — this parameter is additive, added
// only so gap-mastery.repo.ts's locked, advisory-lock-guarded transaction
// (SCENARIO 2 — a new gap + its gap_mastery row in one transaction) can pass
// its own `tx` instead of a second, unlocked connection.
export async function insertDiscoveredGaps(
  topicId: string,
  discovered: { label: string; depth: DepthLevel; concern: Concern | null }[],
  db: DbExecutor = getDb(),
): Promise<Gap[]> {
  if (discovered.length === 0) {
    return [];
  }

  const rows = discovered.map((d) => ({
    id: newId("gap"),
    topicId,
    label: d.label,
    depth: d.depth,
    origin: "ai" as const,
    state: "open" as const,
    wanted: false,
    concern: d.concern,
  }));

  await db.insert(gaps).values(rows);

  return rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    label: r.label,
    depth: r.depth,
    origin: r.origin,
    state: r.state,
    wanted: r.wanted,
    concern: r.concern,
    lastEvaluatedAt: null,
  }));
}

export async function listGapsForConfirmedCurricula(): Promise<Gap[]> {
  const rows = await getDb().select().from(gaps);

  return rows.map((row) => rowToGap(row));
}
