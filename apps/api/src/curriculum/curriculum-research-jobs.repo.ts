import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { curricula, sources } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { ownedBy, ownerPatch } from "./curriculum-job-owner.js";
import { deleteAllCurriculumSources, type ResearchSourceInput } from "./curriculum.repo.js";

export async function touchResearchJob(curriculumId: string, ownerToken?: string): Promise<boolean> {
  const rows = await getDb()
    .update(curricula)
    .set({ status: "curating", researchTouchedAt: new Date(), ...ownerPatch(ownerToken) })
    .where(eq(curricula.id, curriculumId))
    .returning({ id: curricula.id });

  return rows.length > 0;
}

export async function clearResearchJobTouch(curriculumId: string, ownerToken?: string): Promise<void> {
  await getDb()
    .update(curricula)
    .set({ researchTouchedAt: null })
    .where(ownedBy(curriculumId, ownerToken));
}

export async function finishResearchJob(curriculumId: string, ownerToken?: string): Promise<void> {
  await getDb()
    .update(curricula)
    .set({ status: "awaiting_source_approval", researchTouchedAt: null, researchOwner: null })
    .where(ownedBy(curriculumId, ownerToken));
}

// Acts only for the run that owns the course; fails it only while still curating.
export async function failResearchJob(curriculumId: string, ownerToken?: string): Promise<void> {
  await getDb()
    .update(curricula)
    .set({
      status: sql`case when ${curricula.status} = 'curating' then 'failed' else ${curricula.status} end`,
      researchTouchedAt: null,
    })
    .where(ownedBy(curriculumId, ownerToken));
}

export async function failStaleResearchJobs(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await getDb()
    .update(curricula)
    .set({ status: "failed", researchTouchedAt: null })
    .where(
      and(
        eq(curricula.status, "curating"),
        isNotNull(curricula.researchTouchedAt),
        lt(curricula.researchTouchedAt, cutoff),
      ),
    )
    .returning({ id: curricula.id });

  return rows.length;
}

export async function replaceSourcesWithResearchMarker(
  curriculumId: string,
  marker: ResearchSourceInput,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await deleteAllCurriculumSources(curriculumId, tx);
    await tx.insert(sources).values({
      id: newId("src"),
      curriculumId,
      kind: marker.kind,
      value: marker.value,
      title: marker.title,
      fetchedText: "",
    });
  });
}

export async function deletePendingSources(curriculumId: string): Promise<void> {
  await getDb()
    .delete(sources)
    .where(and(eq(sources.curriculumId, curriculumId), eq(sources.approvalStatus, "pending")));
}
