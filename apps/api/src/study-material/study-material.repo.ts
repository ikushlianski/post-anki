import { and, desc, eq, lt } from "drizzle-orm";
import type { StudyMaterial, StudyMaterialCitation, StudyMaterialKind } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { studyMaterials } from "../db/schema.js";
import { GENERATING_STALE_AFTER_MS } from "../shared/generating-staleness.js";
import { newId } from "../shared/id.js";

function rowToStudyMaterial(row: typeof studyMaterials.$inferSelect): StudyMaterial {
  return {
    id: row.id,
    topicId: row.topicId,
    kind: row.kind as StudyMaterialKind,
    status: row.status as StudyMaterial["status"],
    body: row.body,
    citations: row.citations ?? [],
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertGeneratingStudyMaterial(
  topicId: string,
  kind: StudyMaterialKind,
): Promise<StudyMaterial> {
  const rows = await getDb()
    .insert(studyMaterials)
    .values({ id: newId("sm"), topicId, kind, status: "generating" })
    .returning();

  return rowToStudyMaterial(rows[0]!);
}

export async function setStudyMaterialReady(
  id: string,
  body: string,
  citations: StudyMaterialCitation[],
): Promise<void> {
  await getDb()
    .update(studyMaterials)
    .set({ status: "ready", body, citations, failureReason: null })
    .where(eq(studyMaterials.id, id));
}

export async function setStudyMaterialFailed(id: string, failureReason: string): Promise<void> {
  await getDb()
    .update(studyMaterials)
    .set({ status: "failed", failureReason })
    .where(eq(studyMaterials.id, id));
}

export async function failStaleGeneratingStudyMaterials(
  topicId: string,
  olderThanMs: number = GENERATING_STALE_AFTER_MS,
): Promise<number> {
  const rows = await getDb()
    .update(studyMaterials)
    .set({ status: "failed", failureReason: "generation_timed_out" })
    .where(
      and(
        eq(studyMaterials.topicId, topicId),
        eq(studyMaterials.status, "generating"),
        lt(studyMaterials.createdAt, new Date(Date.now() - olderThanMs)),
      ),
    )
    .returning({ id: studyMaterials.id });

  return rows.length;
}

export async function listStudyMaterialsForTopic(topicId: string): Promise<StudyMaterial[]> {
  const rows = await getDb()
    .select()
    .from(studyMaterials)
    .where(eq(studyMaterials.topicId, topicId))
    .orderBy(desc(studyMaterials.createdAt));

  return rows.map(rowToStudyMaterial);
}
