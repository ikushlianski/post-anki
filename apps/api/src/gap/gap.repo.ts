import { eq } from "drizzle-orm";
import type { Concern, DepthLevel, Gap } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { gaps } from "../db/schema.js";
import { newId } from "../shared/id.js";

export function rowToGap(row: typeof gaps.$inferSelect): Gap {
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
  };
}

export async function listGapsForTopic(topicId: string): Promise<Gap[]> {
  const rows = await getDb().select().from(gaps).where(eq(gaps.topicId, topicId));

  return rows.map(rowToGap);
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

export async function insertDiscoveredGaps(
  topicId: string,
  discovered: { label: string; depth: DepthLevel; concern: Concern | null }[],
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

  await getDb().insert(gaps).values(rows);

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

  return rows.map(rowToGap);
}
