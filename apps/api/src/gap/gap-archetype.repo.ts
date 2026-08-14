import { eq, inArray } from "drizzle-orm";
import type { Archetype } from "@post-anki/shared";
import { zeroArchetypeLastUsedAt, type ArchetypeLastUsedAt } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { gapArchetypeState } from "../db/schema.js";
import { newId } from "../shared/id.js";

export type GapArchetypeStateRow = typeof gapArchetypeState.$inferSelect;

export interface GapArchetypeState {
  gapId: string;
  applicableArchetypes: Archetype[];
  archetypeLastUsedAt: ArchetypeLastUsedAt;
}

function rowToState(row: GapArchetypeStateRow): GapArchetypeState {
  return {
    gapId: row.gapId,
    applicableArchetypes: (row.applicableArchetypes ?? []) as Archetype[],
    archetypeLastUsedAt: row.archetypeLastUsedAt as ArchetypeLastUsedAt,
  };
}

export async function getGapArchetypeState(gapId: string): Promise<GapArchetypeState | null> {
  const rows = await getDb()
    .select()
    .from(gapArchetypeState)
    .where(eq(gapArchetypeState.gapId, gapId));
  const row = rows[0];

  return row ? rowToState(row) : null;
}

// No advisory lock / FOR UPDATE, deliberately — unlike gap_mastery's own
// write path. A lost update here means at most one archetype gets reused one
// session earlier than ideal, self-correcting on the very next selection —
// not the real correctness stake gap_mastery's cycling state has.
export async function recordArchetypeClassification(
  gapId: string,
  applicable: Archetype[],
  usedNow: Archetype | null,
  now: string,
): Promise<void> {
  const lastUsedAt = zeroArchetypeLastUsedAt();

  if (usedNow && applicable.includes(usedNow)) {
    lastUsedAt[usedNow] = now;
  }

  await getDb()
    .insert(gapArchetypeState)
    .values({
      id: newId("gaparch"),
      gapId,
      applicableArchetypes: applicable,
      archetypeLastUsedAt: lastUsedAt,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing({ target: gapArchetypeState.gapId });
}

export async function recordArchetypeUsage(
  gapId: string,
  archetype: Archetype,
  now: string,
): Promise<void> {
  const existing = await getGapArchetypeState(gapId);

  if (!existing) {
    return;
  }

  const lastUsedAt = { ...existing.archetypeLastUsedAt, [archetype]: now };

  await getDb()
    .update(gapArchetypeState)
    .set({ archetypeLastUsedAt: lastUsedAt, updatedAt: new Date(now) })
    .where(eq(gapArchetypeState.gapId, gapId));
}

export async function deleteGapArchetypeStateForGapIds(
  gapIds: string[],
  db: DbExecutor,
): Promise<void> {
  if (gapIds.length === 0) {
    return;
  }

  await db.delete(gapArchetypeState).where(inArray(gapArchetypeState.gapId, gapIds));
}
