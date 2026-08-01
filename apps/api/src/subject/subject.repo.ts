import { and, desc, eq, or } from "drizzle-orm";
import type { CreateSubjectInput, MergeSubjectsResult, Subject } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, domainNodes, subjectDuplicateSuggestions, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { deleteCurriculum } from "../curriculum/curriculum.repo.js";
import { withMergeLock, withSubjectLock, type Tx } from "../shared/merge-lock.js";
import { insertOntologyMergeLog } from "../ontology-merge/ontology-merge.repo.js";

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

export interface SubjectForDuplicateScan {
  id: string;
  name: string;
  description: string | null;
  embedding: number[] | null;
  embeddingHash: string | null;
}

// ai-duplicate-detection (issue #63) — the orchestrator's only read of the
// subjects table. Scoped to "architecture-mentor" only (SCENARIO 1 —
// language-practice subjects, e.g. flashcard decks, are never compared or
// suggested, matching mergeSubjects' own kind restriction) and exposes the
// internal embedding/embeddingHash columns the public Subject type
// deliberately omits.
export async function listArchitectureMentorSubjectsForDuplicateScan(): Promise<
  SubjectForDuplicateScan[]
> {
  return getDb()
    .select({
      id: subjects.id,
      name: subjects.name,
      description: subjects.description,
      embedding: subjects.embedding,
      embeddingHash: subjects.embeddingHash,
    })
    .from(subjects)
    .where(eq(subjects.kind, "architecture-mentor"));
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

  return toSubject({
    ...row,
    createdAt: new Date(),
    embedding: null,
    embeddingHash: null,
    embeddedAt: null,
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
    .set({ embedding, embeddingHash: hash, embeddedAt: new Date() })
    .where(eq(subjects.id, subjectId));
}

// ai-duplicate-detection (issue #63) — shared by mergeSubjects and
// deleteSubject: whenever a subject stops existing (merged away or plain-
// deleted), every OTHER pending duplicate-suggestion row that still
// references it must be invalidated to "stale" (distinct from "rejected" —
// spec.md Decision #5) rather than left dangling on a subject id that no
// longer exists. Runs inside the caller's own transaction so this
// invalidation and the row deletion that necessitates it commit atomically.
async function invalidateStalePendingDuplicateSuggestions(
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

    const owned = await tx
      .select()
      .from(curricula)
      .where(eq(curricula.subjectId, subjectId));

    for (const c of owned) {
      await deleteCurriculum(c.id, tx);
    }

    await tx.delete(subjects).where(eq(subjects.id, subjectId));
    await invalidateStalePendingDuplicateSuggestions(tx, subjectId);

    return true;
  });
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
 *
 * `resolvingSuggestionId` (ai-duplicate-detection, issue #63) — when this
 * merge is the atomic-accept path for a subject-duplicate suggestion, the
 * caller passes the id of the specific suggestion being accepted. After the
 * usual stale-invalidation sweep below sets EVERY pending suggestion
 * referencing sourceId (including this one) to "stale", this one row is
 * immediately overwritten to "accepted" instead — still inside this same
 * transaction, so either both effects commit or neither does (spec.md's
 * Decision #7 / architecture.md's "Accept must be atomic" — fixes a crash
 * window an earlier two-sequential-writes draft left open, where an
 * accepted suggestion could get permanently stuck at "stale"). Omitted
 * (undefined) for the pre-existing manual "Merge into…" control, which has
 * no suggestion to resolve — behavior for that call site is unchanged.
 */
export async function mergeSubjects(
  targetId: string,
  sourceId: string,
  resolvingSuggestionId?: string,
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

    await invalidateStalePendingDuplicateSuggestions(tx, sourceId);

    if (resolvingSuggestionId) {
      await tx
        .update(subjectDuplicateSuggestions)
        .set({ status: "accepted", resolvedAt: new Date() })
        .where(eq(subjectDuplicateSuggestions.id, resolvingSuggestionId));
    }

    await insertOntologyMergeLog(
      {
        entityType: "subject",
        targetId,
        targetName: targetRow.name,
        sourceId,
        sourceName: sourceRow.name,
        reassignedCounts: {
          curriculaMoved: movedCurricula.length,
          domainNodesMoved: movedDomainNodes.length,
        },
      },
      tx,
    );

    return {
      targetSubjectId: targetId,
      sourceSubjectId: sourceId,
      curriculaMoved: movedCurricula.length,
      domainNodesMoved: movedDomainNodes.length,
    };
  });
}
