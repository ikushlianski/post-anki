import { eq, inArray } from "drizzle-orm";
import type { DepthLevel } from "@post-anki/shared";
import type { PushCandidate } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { curricula, gaps, topics } from "../db/schema.js";
import { rowToGap } from "../gap/gap.repo.js";

export async function gatherPushCandidates(): Promise<PushCandidate[]> {
  const db = getDb();

  const confirmed = await db
    .select()
    .from(curricula)
    .where(eq(curricula.status, "confirmed"));

  if (confirmed.length === 0) {
    return [];
  }

  const curriculumName = new Map(confirmed.map((c) => [c.id, c.name]));
  const confirmedIds = confirmed.map((c) => c.id);

  const topicRows = (
    await db.select().from(topics).where(inArray(topics.curriculumId, confirmedIds))
  ).filter((t) => t.included);

  if (topicRows.length === 0) {
    return [];
  }

  const gapRows = await db
    .select()
    .from(gaps)
    .where(inArray(gaps.topicId, topicRows.map((t) => t.id)));

  return topicRows.map((t) => ({
    topicId: t.id,
    topicTitle: t.title,
    curriculumId: t.curriculumId,
    curriculumName: curriculumName.get(t.curriculumId) ?? "",
    depth: t.depth as DepthLevel,
    gaps: gapRows.filter((g) => g.topicId === t.id).map(rowToGap),
  }));
}
