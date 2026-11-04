import { and, asc, eq, or, sql } from "drizzle-orm";
import type { CreateSubjectInput, Subject, UpdateSubjectInput } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { deleteSubjectGoals } from "../study-goal/add-knowledge-goal.repo.js";
import { curricula, notionIngestionSources, subjectDuplicateSuggestions, subjects } from "../db/schema.js";
import { SubjectHasNotionSourcesError } from "./subject-notion-sources.error.js";
import { newId } from "../shared/id.js";
import { deleteCurriculum } from "../curriculum/curriculum.repo.js";
import { withSubjectLock, type Tx } from "../shared/merge-lock.js";
import { getSubject, toSubject } from "./subject-read.repo.js";
import {
  findParentAssignmentError,
  reparentChildrenOfDeletedSubject,
  type SubjectParentError,
} from "./subject-tree.repo.js";

export type { SubjectParentError };

export type UpdateSubjectResult =
  | { ok: true; subject: Subject | null }
  | { ok: false; error: SubjectParentError };

export async function updateSubject(
  subjectId: string,
  input: UpdateSubjectInput,
): Promise<UpdateSubjectResult> {
  const patch: Partial<typeof subjects.$inferInsert> = {};

  if (input.name !== undefined) {
    patch.name = input.name;
  }

  if (input.modelTier !== undefined) {
    patch.modelTier = input.modelTier;
  }

  if (input.learningIntent !== undefined) {
    patch.learningIntent = input.learningIntent?.trim() ? input.learningIntent.trim() : null;
  }

  if (input.parentId !== undefined) {
    const parentError = await findParentAssignmentError(subjectId, input.parentId);

    if (parentError) {
      return { ok: false, error: parentError };
    }

    patch.parentId = input.parentId;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, subject: await getSubject(subjectId) };
  }

  const row = await getDb().transaction(async (tx) => {
    const newParentId = input.parentId ?? null;

    if (newParentId !== null) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${newParentId})::bigint)`);
    }

    return (await tx.update(subjects).set(patch).where(eq(subjects.id, subjectId)).returning())[0];
  });

  return { ok: true, subject: row ? toSubject(row) : null };
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  const row = {
    id: newId("sub"),
    name: input.name,
    description: input.description ?? null,
    requireSources: input.requireSources ?? false,
    kind: input.kind,
    parentId: input.parentId ?? null,
  };

  await getDb().transaction(async (tx) => {
    if (row.parentId === null) {
      await tx.insert(subjects).values(row);

      return;
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.parentId})::bigint)`);

    await tx.insert(subjects).values(row);
  });

  return toSubject({
    ...row,
    createdAt: new Date(),
    embeddingVec: null,
    embeddingHash: null,
    embeddedAt: null,
    modelTier: null,
    sortOrder: null,
    learningIntent: null,
    newCardsPerDay: null,
    learningStepsMinutes: null,
    relearningStepsMinutes: null,
    desiredRetention: null,
    studyIntent: null,
    examDate: null,
    examPlannedAt: null,
    detailLevel: null,
    hintingEnabled: null,
  });
}

// ai-duplicate-detection (issue #63) — writes a fresh embedding+hash back
// onto a subject row after a successful embeddings call. embeddedAt is set
// to "now" purely for tracing/debugging visibility (architecture.md's "Data
// model evolution") — cache-invalidation logic never reads it, only the
// hash comparison does.
export async function updateSubjectEmbedding(
  subjectId: string,
  embedding: number[],
  hash: string,
): Promise<void> {
  await getDb()
    .update(subjects)
    .set({ embeddingVec: embedding, embeddingHash: hash, embeddedAt: new Date() })
    .where(eq(subjects.id, subjectId));
}

// ai-duplicate-detection (issue #63) — shared by mergeSubjects and
// deleteSubject: whenever a subject stops existing (merged away or plain-
// deleted), every OTHER pending duplicate-suggestion row that still
// references it must be invalidated to "stale" (distinct from "rejected" —
// spec.md Decision #5) rather than left dangling on a subject id that no
// longer exists. Runs inside the caller's own transaction so this
// invalidation and the row deletion that necessitates it commit atomically.
export async function invalidateStalePendingDuplicateSuggestions(
  tx: Tx,
  subjectId: string,
): Promise<void> {
  await tx
    .update(subjectDuplicateSuggestions)
    .set({ status: "stale", resolvedAt: new Date() })
    .where(
      and(
        or(
          eq(subjectDuplicateSuggestions.subjectAId, subjectId),
          eq(subjectDuplicateSuggestions.subjectBId, subjectId),
        ),
        eq(subjectDuplicateSuggestions.status, "pending"),
      ),
    );
}

/**
 * Runs under the subject's advisory lock — the same lock space `mergeSubjects`,
 * `createCurriculum` and `insertDomainNode` take — and re-reads the subject
 * INSIDE that lock, closing the last of the four windows onto this row.
 *
 * Both directions of a delete racing a merge were broken, and differently.
 * Deleting the merge's TARGET enumerated that target's curricula before the
 * merge's uncommitted "reassign the source's curricula" UPDATE was visible, so
 * the subject row went away while a curriculum was still being moved
 * underneath it — and there is no foreign key on curricula.subject_id to catch
 * the orphan. Deleting the merge's SOURCE saw those same curricula still under
 * the source and destroyed the very rows the merge was handing to the target.
 * Serializing on the lock resolves both: whichever operation gets there second
 * observes the first as already committed, and a delete whose subject is gone
 * by then reports `false` rather than half-applying.
 *
 * The transaction that used to wrap only the row deletion plus its
 * stale-suggestion invalidation (SCENARIO 5b) is now that same lock
 * transaction, rather than a second one nested inside it. `deleteCurriculum`
 * runs inside it too — it takes a `DbExecutor`, so the whole delete costs one
 * pooled connection rather than a second one per owned curriculum, and the
 * curricula and the subject row commit together instead of separately.
 */
export async function deleteSubject(subjectId: string): Promise<boolean> {
  return withSubjectLock(subjectId, async (tx) => {
    const existing = (
      await tx.select().from(subjects).where(eq(subjects.id, subjectId))
    )[0];

    if (!existing) {
      return false;
    }

    const [notionSource] = await tx
      .select({ id: notionIngestionSources.id })
      .from(notionIngestionSources)
      .where(eq(notionIngestionSources.subjectId, subjectId))
      .limit(1);

    if (notionSource) {
      throw new SubjectHasNotionSourcesError();
    }

    const owned = await tx
      .select()
      .from(curricula)
      .where(eq(curricula.subjectId, subjectId));

    for (const c of owned) {
      await deleteCurriculum(c.id, tx);
    }

    await tx.delete(subjects).where(eq(subjects.id, subjectId));
    await reparentChildrenOfDeletedSubject(tx, existing);
    await deleteSubjectGoals(subjectId, tx);
    await invalidateStalePendingDuplicateSuggestions(tx, subjectId);

    return true;
  });
}
