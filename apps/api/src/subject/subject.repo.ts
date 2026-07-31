import { desc, eq } from "drizzle-orm";
import type { CreateSubjectInput, MergeSubjectsResult, Subject } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, domainNodes, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { deleteCurriculum } from "../curriculum/curriculum.repo.js";
import { withMergeLock } from "../shared/merge-lock.js";

function toSubject(r: typeof subjects.$inferSelect): Subject {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    requireSources: r.requireSources,
    kind: r.kind as Subject["kind"],
  };
}

export async function listSubjects(): Promise<Subject[]> {
  const rows = await getDb()
    .select()
    .from(subjects)
    .orderBy(desc(subjects.createdAt));

  return rows.map(toSubject);
}

export async function getSubject(subjectId: string): Promise<Subject | null> {
  const row = (
    await getDb().select().from(subjects).where(eq(subjects.id, subjectId))
  )[0];

  return row ? toSubject(row) : null;
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  const row = {
    id: newId("sub"),
    name: input.name,
    description: input.description ?? null,
    requireSources: input.requireSources ?? false,
    kind: input.kind,
  };

  await getDb().insert(subjects).values(row);

  return toSubject({ ...row, createdAt: new Date() });
}

export async function deleteSubject(subjectId: string): Promise<boolean> {
  const db = getDb();

  const existing = (
    await db.select().from(subjects).where(eq(subjects.id, subjectId))
  )[0];

  if (!existing) {
    return false;
  }

  const owned = await db
    .select()
    .from(curricula)
    .where(eq(curricula.subjectId, subjectId));

  for (const c of owned) {
    await deleteCurriculum(c.id);
  }

  await db.delete(subjects).where(eq(subjects.id, subjectId));

  return true;
}

export type MergeSubjectsError = "self_merge" | "not_found" | "kind_mismatch";

/**
 * Absorbs `sourceId` into `targetId`: every curriculum and the whole
 * domain_nodes forest owned by the source move to the target (subject_id
 * only — domain_nodes.parent_id is never touched, so the moved forest keeps
 * its shape and becomes additional root(s) under the target), then the
 * source subject row is deleted directly (not via deleteSubject(), which
 * would cascade-delete the curricula this merge just reassigned away — see
 * spec.md Decision #4).
 *
 * Preconditions are re-checked INSIDE the transaction, after both advisory
 * locks are held (sorted lexicographically to prevent a cross-merge
 * deadlock) — never before opening it — so a concurrent merge that already
 * deleted one side surfaces as a clean "not_found" 404 instead of racing on
 * a stale pre-transaction read (spec.md's double-merge race, Scenario 5).
 */
export async function mergeSubjects(
  targetId: string,
  sourceId: string,
): Promise<MergeSubjectsResult | { error: MergeSubjectsError }> {
  return withMergeLock(targetId, sourceId, async (tx) => {
    const targetRow = (
      await tx.select().from(subjects).where(eq(subjects.id, targetId))
    )[0];
    const sourceRow = (
      await tx.select().from(subjects).where(eq(subjects.id, sourceId))
    )[0];

    if (!targetRow || !sourceRow) {
      return { error: "not_found" as const };
    }

    if (targetRow.kind !== "architecture-mentor" || sourceRow.kind !== "architecture-mentor") {
      return { error: "kind_mismatch" as const };
    }

    const movedCurricula = await tx
      .update(curricula)
      .set({ subjectId: targetId })
      .where(eq(curricula.subjectId, sourceId))
      .returning({ id: curricula.id });

    const movedDomainNodes = await tx
      .update(domainNodes)
      .set({ subjectId: targetId })
      .where(eq(domainNodes.subjectId, sourceId))
      .returning({ id: domainNodes.id });

    await tx.delete(subjects).where(eq(subjects.id, sourceId));

    return {
      targetSubjectId: targetId,
      sourceSubjectId: sourceId,
      curriculaMoved: movedCurricula.length,
      domainNodesMoved: movedDomainNodes.length,
    };
  });
}
