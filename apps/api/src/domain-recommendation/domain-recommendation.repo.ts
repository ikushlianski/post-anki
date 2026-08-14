import { and, desc, eq } from "drizzle-orm";
import type { DomainRecommendation, DomainRecommendationStatus } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { domainRecommendations } from "../db/schema.js";
import { newId } from "../shared/id.js";

function toDomainRecommendation(
  row: typeof domainRecommendations.$inferSelect,
): DomainRecommendation {
  return {
    id: row.id,
    subjectId: row.subjectId,
    domainNodeId: row.domainNodeId,
    sourceNodeId: row.sourceNodeId,
    axis: row.axis as DomainRecommendation["axis"],
    reason: row.reason,
    source: row.source,
    status: row.status as DomainRecommendationStatus,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdCurriculumId: row.createdCurriculumId ?? null,
  };
}

export interface InsertRecommendationParams {
  subjectId: string;
  domainNodeId: string;
  sourceNodeId: string;
  axis: DomainRecommendation["axis"];
  reason: string;
  source: string;
}

export async function insertRecommendation(
  params: InsertRecommendationParams,
  db: DbExecutor = getDb(),
): Promise<DomainRecommendation> {
  const id = newId("domainrec");

  await db.insert(domainRecommendations).values({
    id,
    subjectId: params.subjectId,
    domainNodeId: params.domainNodeId,
    sourceNodeId: params.sourceNodeId,
    axis: params.axis,
    reason: params.reason,
    source: params.source,
  });

  const inserted = (
    await db.select().from(domainRecommendations).where(eq(domainRecommendations.id, id))
  )[0]!;

  return toDomainRecommendation(inserted);
}

export async function listRecommendationsForSubject(
  subjectId: string,
  status?: DomainRecommendationStatus,
  db: DbExecutor = getDb(),
): Promise<DomainRecommendation[]> {
  const rows = await db
    .select()
    .from(domainRecommendations)
    .where(
      status
        ? and(eq(domainRecommendations.subjectId, subjectId), eq(domainRecommendations.status, status))
        : eq(domainRecommendations.subjectId, subjectId),
    )
    .orderBy(desc(domainRecommendations.createdAt));

  return rows.map(toDomainRecommendation);
}

// The trigger's own existence check (spec.md step 5) — every (subjectId,
// domainNodeId) that already has a row here, in ANY status, is what makes a
// re-trigger a no-op-avoidance fast path ahead of the unique index's hard
// backstop. Status-agnostic on purpose: filtering by `ne(status,
// "rejected")` (curriculum_domain_node_mappings' own idiom for a
// re-suggestable table) would let a rejected node come back on the very next
// trigger run — the opposite of this table's permanent-suppression
// contract.
export async function listExistingDomainNodeIds(
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<Set<string>> {
  const rows = await db
    .select({ domainNodeId: domainRecommendations.domainNodeId })
    .from(domainRecommendations)
    .where(eq(domainRecommendations.subjectId, subjectId));

  return new Set(rows.map((row) => row.domainNodeId));
}

export async function getRecommendation(
  id: string,
  db: DbExecutor = getDb(),
): Promise<DomainRecommendation | null> {
  const row = (
    await db.select().from(domainRecommendations).where(eq(domainRecommendations.id, id))
  )[0];

  return row ? toDomainRecommendation(row) : null;
}

export type ResolveRecommendationClaimError = "not_found" | "already_resolved";

// Claim-first: `UPDATE ... WHERE status = 'pending' RETURNING *`, the same
// pattern resolvePrioritySuggestion/resolveDomainTopicSuggestion use — a
// double-click or a second tab gets `already_resolved` instead of silently
// re-applying. The orchestrator owns the accept side effect (creating the
// curriculum); this is only the claim step, same split as
// domain-priority-review.orchestrator.ts vs. domain-map.repo.ts.
export async function resolveRecommendationClaim(
  id: string,
  status: "accepted" | "rejected",
  db: DbExecutor = getDb(),
): Promise<DomainRecommendation | { error: ResolveRecommendationClaimError }> {
  const resolvedAt = new Date();

  const claimed = (
    await db
      .update(domainRecommendations)
      .set({ status, resolvedAt })
      .where(and(eq(domainRecommendations.id, id), eq(domainRecommendations.status, "pending")))
      .returning()
  )[0];

  if (!claimed) {
    const existing = (
      await db.select().from(domainRecommendations).where(eq(domainRecommendations.id, id))
    )[0];

    return { error: existing ? ("already_resolved" as const) : ("not_found" as const) };
  }

  return toDomainRecommendation(claimed);
}

export async function setCreatedCurriculumId(
  id: string,
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<DomainRecommendation> {
  const updated = (
    await db
      .update(domainRecommendations)
      .set({ createdCurriculumId: curriculumId })
      .where(eq(domainRecommendations.id, id))
      .returning()
  )[0]!;

  return toDomainRecommendation(updated);
}

// The post-claim failure recovery (spec.md's Decision 12) — mirrors
// approveMiniCourseRecommendation's own releaseRecommendationClaim call on
// the identical subject_not_found failure shape
// (learning-list-approval.orchestrator.ts). Releases the claim back to
// "pending" and clears resolvedAt, rather than leaving the row stuck
// "accepted" with a null createdCurriculumId.
export async function releaseRecommendationClaim(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(domainRecommendations)
    .set({ status: "pending", resolvedAt: null })
    .where(eq(domainRecommendations.id, id));
}
