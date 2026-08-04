import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  DepthLevel,
  DomainNode,
  DomainNodeTreeItem,
  DomainPrioritySuggestion,
  DomainPrioritySuggestionStatus,
  DomainSuggestionStatus,
  DomainSupersessionSuggestion,
  DomainTopicSuggestion,
  MergeDomainNodesResult,
  Topic,
} from "@post-anki/shared";
import { domainNodeProgress, domainPriorityDistance, isAncestor } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  curriculumDomainNodeMappings,
  domainNodes,
  domainPrioritySuggestions,
  domainSupersessionSuggestions,
  domainTopicSuggestions,
  subjects,
  topics,
  trackedToolScanState,
} from "../db/schema.js";
import { newId } from "../shared/id.js";
import { withMergeLock, withSubjectLock } from "../shared/merge-lock.js";
import { insertOntologyMergeLog } from "../ontology-merge/ontology-merge.repo.js";

function toDomainNode(row: typeof domainNodes.$inferSelect): DomainNode {
  return {
    id: row.id,
    subjectId: row.subjectId,
    parentId: row.parentId,
    name: row.name,
    description: row.description ?? null,
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    targetDepth: (row.targetDepth as DepthLevel | null) ?? null,
    supersededAt: row.supersededAt ? row.supersededAt.toISOString() : null,
    supersededReason: row.supersededReason ?? null,
    source: row.source as DomainNode["source"],
  };
}

function toDomainPrioritySuggestion(
  row: typeof domainPrioritySuggestions.$inferSelect,
): DomainPrioritySuggestion {
  return {
    id: row.id,
    domainNodeId: row.domainNodeId,
    subjectId: row.subjectId,
    currentTargetDepth: (row.currentTargetDepth as DepthLevel | null) ?? null,
    suggestedTargetDepth: row.suggestedTargetDepth as DepthLevel,
    reason: row.reason,
    source: row.source,
    status: row.status as DomainPrioritySuggestionStatus,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export type InsertDomainNodeError = "subject_not_found";

// Serialized behind any in-flight merge or delete of the owning subject
// (same `hashtext(id)::bigint` advisory-lock space `createCurriculum` and
// `mergeSubjects` use), and re-reads the subject INSIDE the lock: a node
// created by resolveDomainPlacement's sibling-discovery path can otherwise
// land under a subject a concurrent merge is in the middle of deleting.
export async function insertDomainNode(params: {
  subjectId: string;
  parentId: string | null;
  name: string;
  description?: string | null;
  order?: number;
}): Promise<DomainNode | { error: InsertDomainNodeError }> {
  const row = {
    id: newId("dnode"),
    subjectId: params.subjectId,
    parentId: params.parentId,
    name: params.name,
    description: params.description ?? null,
    order: params.order ?? 0,
  };

  return withSubjectLock(params.subjectId, async (tx) => {
    const subjectRow = (
      await tx.select().from(subjects).where(eq(subjects.id, params.subjectId))
    )[0];

    if (!subjectRow) {
      return { error: "subject_not_found" as const };
    }

    const inserted = (await tx.insert(domainNodes).values(row).returning())[0]!;

    return toDomainNode(inserted);
  });
}

export async function listDomainNodesForSubject(subjectId: string): Promise<DomainNode[]> {
  const rows = await getDb()
    .select()
    .from(domainNodes)
    .where(eq(domainNodes.subjectId, subjectId));

  return rows.map(toDomainNode);
}

export async function getDomainNode(nodeId: string): Promise<DomainNode | null> {
  const row = (
    await getDb().select().from(domainNodes).where(eq(domainNodes.id, nodeId))
  )[0];

  return row ? toDomainNode(row) : null;
}

function toTopicForProgress(row: typeof topics.$inferSelect): Topic {
  return {
    id: row.id,
    moduleId: row.moduleId,
    title: row.title,
    order: row.order,
    priority: row.priority as Topic["priority"],
    included: row.included,
    selfGrade: row.selfGrade,
    depth: row.depth as Topic["depth"],
    learningStatus: row.learningStatus as Topic["learningStatus"],
    questions: [],
    progress: {
      status: row.progressStatus as Topic["progress"]["status"],
      maturity: row.progressMaturity,
      attempts: row.progressAttempts,
      lastInteractedAt: row.progressLastInteractedAt
        ? row.progressLastInteractedAt.toISOString()
        : null,
    },
  };
}

// GET /subjects/:id/domain-map's read path: three flat queries (domain_nodes
// for the subject, curricula for the subject, confirmed
// curriculum_domain_node_mappings for those curricula) — never a recursive
// CTE, never N+1, regardless of tree depth — assembled and rolled up in
// memory via the pure domainNodeProgress() deriver. No agent, no LLM call
// anywhere in this path.
//
// decouple-curricula-from-domain-nodes (issue #84) — placement moved off
// curricula.domain_node_id (a single nullable column) onto this many-to-many
// table, so a curriculum can now be confirmed against MORE THAN ONE node
// (SCENARIO 9): one {domainNodeId, topics} entry per confirmed mapping row,
// same curriculum's full topic list contributing to each. curriculaByNodeId
// dedupes by curriculum id per node defensively — mergeDomainNodes'
// re-pointing already avoids creating a duplicate confirmed pair, but this
// read path stays correct even if one ever slipped through.
export async function getDomainMapForSubject(
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<DomainNodeTreeItem[]> {
  const nodeRows = await db.select().from(domainNodes).where(eq(domainNodes.subjectId, subjectId));

  const subjectCurricula = await db
    .select({ id: curricula.id, name: curricula.name })
    .from(curricula)
    .where(eq(curricula.subjectId, subjectId));
  const curriculumNameById = new Map(subjectCurricula.map((c) => [c.id, c.name]));
  const curriculumIds = subjectCurricula.map((c) => c.id);

  const confirmedMappings = curriculumIds.length
    ? await db
        .select()
        .from(curriculumDomainNodeMappings)
        .where(
          and(
            inArray(curriculumDomainNodeMappings.curriculumId, curriculumIds),
            eq(curriculumDomainNodeMappings.status, "confirmed"),
          ),
        )
    : [];

  const topicRows = curriculumIds.length
    ? await db.select().from(topics).where(inArray(topics.curriculumId, curriculumIds))
    : [];

  const topicsByCurriculumId = new Map<string, typeof topics.$inferSelect[]>();

  for (const topicRow of topicRows) {
    const list = topicsByCurriculumId.get(topicRow.curriculumId) ?? [];
    list.push(topicRow);
    topicsByCurriculumId.set(topicRow.curriculumId, list);
  }

  const curriculumTopics = confirmedMappings.map((mapping) => ({
    domainNodeId: mapping.domainNodeId,
    topics: (topicsByCurriculumId.get(mapping.curriculumId) ?? []).map(toTopicForProgress),
  }));

  const curriculaByNodeId = new Map<string, { id: string; name: string }[]>();

  for (const mapping of confirmedMappings) {
    const list = curriculaByNodeId.get(mapping.domainNodeId) ?? [];

    if (list.some((entry) => entry.id === mapping.curriculumId)) {
      continue;
    }

    list.push({
      id: mapping.curriculumId,
      name: curriculumNameById.get(mapping.curriculumId) ?? "",
    });
    curriculaByNodeId.set(mapping.domainNodeId, list);
  }

  const nodeRefs = nodeRows.map((row) => ({ id: row.id, parentId: row.parentId }));

  function buildItem(row: typeof domainNodes.$inferSelect): DomainNodeTreeItem {
    const percent = domainNodeProgress(row.id, nodeRefs, curriculumTopics).percent;
    const targetDepth = (row.targetDepth as DepthLevel | null) ?? null;

    const children = nodeRows
      .filter((child) => child.parentId === row.id)
      .sort((a, b) => a.order - b.order)
      .map(buildItem);

    return {
      id: row.id,
      subjectId: row.subjectId,
      parentId: row.parentId,
      name: row.name,
      description: row.description ?? null,
      order: row.order,
      percent,
      targetDepth,
      priorityDistance: domainPriorityDistance(targetDepth, percent),
      curricula: curriculaByNodeId.get(row.id) ?? [],
      children,
      // doc-changelog-scan (issue #49) — projected read-only alongside
      // percent, never derived from it (spec.md's Decisions #2).
      supersededAt: row.supersededAt ? row.supersededAt.toISOString() : null,
      supersededReason: row.supersededReason ?? null,
      source: row.source as DomainNodeTreeItem["source"],
    };
  }

  return nodeRows
    .filter((row) => row.parentId === null)
    .sort((a, b) => a.order - b.order)
    .map(buildItem);
}

export type MergeDomainNodesError = "self_merge" | "not_found" | "different_subjects" | "cycle";

/**
 * domain-node-merge (issue #61) — the fourth "absorb source into target"
 * merge in this codebase (alongside mergeSubjects, mergeCurricula,
 * mergeTags), and the first one that re-parents an existing row. Every
 * curriculum and every direct child of the source node move onto the
 * target; the source row is deleted. Re-parented children get their `order`
 * offset past the target's current max child order (mirrors
 * mergeCurricula's own `modules.order` offset — spec.md Decision #8), so
 * they never collide with the target's existing children.
 *
 * The cycle guard (isAncestor) is what makes this safe: re-parenting the
 * source's children could otherwise make the target simultaneously an
 * ancestor and a descendant of one of them — a cycle that would make
 * getDomainMapForSubject()'s buildItem() recursion (and any future
 * ancestor-path walk) loop forever. See spec.md's "Cycle-guard design" for
 * the full reasoning behind walking the TARGET's ancestors (not the
 * source's descendants), and why it deliberately does not reuse
 * domainNodeProgress()'s MAX_DEPTH cap.
 *
 * Preconditions are re-checked INSIDE the transaction, after both advisory
 * locks are held — never before opening it — so a concurrent merge that
 * already deleted one side surfaces as a clean "not_found" instead of
 * racing on a stale pre-transaction read (same TOCTOU-avoidance pattern as
 * every other merge in this codebase).
 */
export async function mergeDomainNodes(
  targetId: string,
  sourceId: string,
): Promise<MergeDomainNodesResult | { error: MergeDomainNodesError }> {
  return withMergeLock(targetId, sourceId, async (tx) => {
    const targetRow = (
      await tx.select().from(domainNodes).where(eq(domainNodes.id, targetId))
    )[0];
    const sourceRow = (
      await tx.select().from(domainNodes).where(eq(domainNodes.id, sourceId))
    )[0];

    if (!targetRow || !sourceRow) {
      return { error: "not_found" as const };
    }

    if (targetRow.subjectId !== sourceRow.subjectId) {
      return { error: "different_subjects" as const };
    }

    const allNodesForSubject = await tx
      .select({ id: domainNodes.id, parentId: domainNodes.parentId })
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, targetRow.subjectId));

    if (isAncestor(sourceId, targetId, allNodesForSubject)) {
      return { error: "cycle" as const };
    }

    // decouple-curricula-from-domain-nodes (issue #84) — placement moved off
    // curricula.domain_node_id onto the many-to-many
    // curriculum_domain_node_mappings table, which (unlike the old single
    // column) can hold several rows per curriculum at a single node (e.g. a
    // rejected AI suggestion alongside a separately confirmed manual
    // placement — the ordinary "AI suggests A and B, user confirms B,
    // rejects A" flow). Re-pointing must therefore be status-aware on BOTH
    // sides:
    //
    // - "already there" at the target only counts a CONFIRMED row. A stale
    //   rejected/suggested row at the target must never block moving the
    //   source's real confirmed placement over — otherwise the confirmed row
    //   gets deleted as "redundant" against a row that was never the actual
    //   placement, and the curriculum silently ends up with zero confirmed
    //   mappings.
    // - Per curriculum at the SOURCE, the confirmed row (if any) is the one
    //   that gets re-pointed (or deduped against an existing confirmed
    //   target row); every other row for that curriculum at the source is a
    //   now-stale suggestion against a node that's about to be deleted, so
    //   it's dropped rather than risking a nondeterministic pick between it
    //   and the confirmed row.
    const sourceMappingRows = await tx
      .select()
      .from(curriculumDomainNodeMappings)
      .where(eq(curriculumDomainNodeMappings.domainNodeId, sourceId))
      .orderBy(asc(curriculumDomainNodeMappings.createdAt));
    const targetConfirmedMappingRows = await tx
      .select({ curriculumId: curriculumDomainNodeMappings.curriculumId })
      .from(curriculumDomainNodeMappings)
      .where(
        and(
          eq(curriculumDomainNodeMappings.domainNodeId, targetId),
          eq(curriculumDomainNodeMappings.status, "confirmed"),
        ),
      );
    const targetConfirmedCurriculumIds = new Set(targetConfirmedMappingRows.map((row) => row.curriculumId));

    const sourceRowsByCurriculum = new Map<string, typeof sourceMappingRows>();
    for (const row of sourceMappingRows) {
      const existing = sourceRowsByCurriculum.get(row.curriculumId);
      if (existing) {
        existing.push(row);
      } else {
        sourceRowsByCurriculum.set(row.curriculumId, [row]);
      }
    }

    let movedCurriculaCount = 0;

    for (const [curriculumId, rows] of sourceRowsByCurriculum) {
      const confirmedRow = rows.find((row) => row.status === "confirmed");

      // No confirmed row for this curriculum at the source at all — every
      // row here is a still-pending suggestion or a rejected one, neither of
      // which competes with a target-side confirmed placement (that's the
      // targetConfirmedCurriculumIds check above, which only ever applies to
      // a confirmed source row). Re-point them like domainTopicSuggestions
      // below rather than deleting: a pending "suggested" row is an
      // unresolved review item the mapping panel still needs to show, and
      // "rejected rows are never deleted" is this table's own audit-trail
      // convention (todo.md). Duplicates at the target are harmless — the
      // table has no unique constraint on (curriculumId, domainNodeId), and
      // every read path (getDomainMapForSubject) only ever looks at
      // status = 'confirmed'.
      if (!confirmedRow) {
        await tx
          .update(curriculumDomainNodeMappings)
          .set({ domainNodeId: targetId })
          .where(
            inArray(
              curriculumDomainNodeMappings.id,
              rows.map((row) => row.id),
            ),
          );

        continue;
      }

      const rowsToDrop = rows.filter((row) => row.id !== confirmedRow.id);

      if (targetConfirmedCurriculumIds.has(curriculumId)) {
        rowsToDrop.push(confirmedRow);
      } else {
        await tx
          .update(curriculumDomainNodeMappings)
          .set({ domainNodeId: targetId })
          .where(eq(curriculumDomainNodeMappings.id, confirmedRow.id));
        targetConfirmedCurriculumIds.add(curriculumId);
        movedCurriculaCount += 1;
      }

      if (rowsToDrop.length > 0) {
        await tx.delete(curriculumDomainNodeMappings).where(
          inArray(
            curriculumDomainNodeMappings.id,
            rowsToDrop.map((row) => row.id),
          ),
        );
      }
    }

    const targetMaxOrderRow = (
      await tx
        .select({ maxOrder: sql<number>`coalesce(max(${domainNodes.order}), 0)` })
        .from(domainNodes)
        .where(eq(domainNodes.parentId, targetId))
    )[0];
    const targetMaxOrder = targetMaxOrderRow?.maxOrder ?? 0;

    const movedChildNodes = await tx
      .update(domainNodes)
      .set({ parentId: targetId, order: sql`${domainNodes.order} + ${targetMaxOrder}` })
      .where(eq(domainNodes.parentId, sourceId))
      .returning({ id: domainNodes.id });

    await tx.delete(domainPrioritySuggestions).where(eq(domainPrioritySuggestions.domainNodeId, sourceId));
    await tx
      .delete(domainSupersessionSuggestions)
      .where(eq(domainSupersessionSuggestions.domainNodeId, sourceId));

    await tx
      .update(domainTopicSuggestions)
      .set({ proposedParentNodeId: targetId })
      .where(eq(domainTopicSuggestions.proposedParentNodeId, sourceId));

    await tx.delete(domainNodes).where(eq(domainNodes.id, sourceId));

    await insertOntologyMergeLog(
      {
        entityType: "domain_node",
        targetId,
        targetName: targetRow.name,
        sourceId,
        sourceName: sourceRow.name,
        reassignedCounts: {
          curriculaMoved: movedCurriculaCount,
          childNodesMoved: movedChildNodes.length,
        },
      },
      tx,
    );

    return {
      targetDomainNodeId: targetId,
      sourceDomainNodeId: sourceId,
      curriculaMoved: movedCurriculaCount,
      childNodesMoved: movedChildNodes.length,
    };
  });
}

// domain-priority-review (issue #52) — PATCH /domain-nodes/:id. Sets or
// clears (null) a node's target depth directly, independent of the review
// flow. Returns null if the node doesn't exist (404 for the controller).
export async function updateDomainNodeTargetDepth(
  nodeId: string,
  targetDepth: DepthLevel | null,
): Promise<DomainNode | null> {
  const db = getDb();

  await db.update(domainNodes).set({ targetDepth }).where(eq(domainNodes.id, nodeId));

  const row = (
    await db.select().from(domainNodes).where(eq(domainNodes.id, nodeId))
  )[0];

  return row ? toDomainNode(row) : null;
}

export interface InsertPrioritySuggestionParams {
  domainNodeId: string;
  subjectId: string;
  currentTargetDepth: DepthLevel | null;
  suggestedTargetDepth: DepthLevel;
  reason: string;
  source: string;
}

export async function insertPrioritySuggestion(
  params: InsertPrioritySuggestionParams,
): Promise<DomainPrioritySuggestion> {
  const db = getDb();
  const id = newId("dpsug");

  await db.insert(domainPrioritySuggestions).values({
    id,
    domainNodeId: params.domainNodeId,
    subjectId: params.subjectId,
    currentTargetDepth: params.currentTargetDepth,
    suggestedTargetDepth: params.suggestedTargetDepth,
    reason: params.reason,
    source: params.source,
  });

  const inserted = (
    await db.select().from(domainPrioritySuggestions).where(eq(domainPrioritySuggestions.id, id))
  )[0]!;

  return toDomainPrioritySuggestion(inserted);
}

export async function listPrioritySuggestionsForSubject(
  subjectId: string,
  status?: DomainPrioritySuggestionStatus,
): Promise<DomainPrioritySuggestion[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(domainPrioritySuggestions)
    .where(
      status
        ? and(
            eq(domainPrioritySuggestions.subjectId, subjectId),
            eq(domainPrioritySuggestions.status, status),
          )
        : eq(domainPrioritySuggestions.subjectId, subjectId),
    )
    .orderBy(desc(domainPrioritySuggestions.createdAt));

  return rows.map(toDomainPrioritySuggestion);
}

export async function getPrioritySuggestion(
  suggestionId: string,
): Promise<DomainPrioritySuggestion | null> {
  const db = getDb();

  const row = (
    await db
      .select()
      .from(domainPrioritySuggestions)
      .where(eq(domainPrioritySuggestions.id, suggestionId))
  )[0];

  return row ? toDomainPrioritySuggestion(row) : null;
}

// PATCH /domain-priority-suggestions/:id. Accepting writes
// suggested_target_depth onto the node's target_depth AND resolves the
// suggestion in one transaction; rejecting only resolves the suggestion —
// the node is never touched. Rejected rows are never deleted (spec.md's
// Decisions #11) — status flips to "rejected", resolvedAt is set, the row
// stays visible as "handled."
export async function resolvePrioritySuggestion(
  suggestionId: string,
  status: "accepted" | "rejected",
): Promise<DomainPrioritySuggestion | null> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select()
        .from(domainPrioritySuggestions)
        .where(eq(domainPrioritySuggestions.id, suggestionId))
    )[0];

    if (!existing) {
      return null;
    }

    const resolvedAt = new Date();

    await tx
      .update(domainPrioritySuggestions)
      .set({ status, resolvedAt })
      .where(eq(domainPrioritySuggestions.id, suggestionId));

    if (status === "accepted") {
      await tx
        .update(domainNodes)
        .set({ targetDepth: existing.suggestedTargetDepth })
        .where(eq(domainNodes.id, existing.domainNodeId));
    }

    return toDomainPrioritySuggestion({ ...existing, status, resolvedAt });
  });
}

// "Last reviewed" / "review due" are derived from
// MAX(domain_priority_suggestions.created_at) for the subject — no separate
// "review run" table (spec.md's Decisions #6). null means never reviewed.
export async function getLastReviewedAt(subjectId: string): Promise<string | null> {
  const db = getDb();

  const rows = await db
    .select()
    .from(domainPrioritySuggestions)
    .where(eq(domainPrioritySuggestions.subjectId, subjectId))
    .orderBy(desc(domainPrioritySuggestions.createdAt))
    .limit(1);

  return rows[0] ? rows[0].createdAt.toISOString() : null;
}

// doc-changelog-scan (issue #49) — repo additions below.

function toDomainTopicSuggestion(
  row: typeof domainTopicSuggestions.$inferSelect,
): DomainTopicSuggestion {
  return {
    id: row.id,
    subjectId: row.subjectId,
    proposedParentNodeId: row.proposedParentNodeId ?? null,
    proposedNodeName: row.proposedNodeName,
    reason: row.reason,
    source: row.source,
    status: row.status as DomainSuggestionStatus,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdDomainNodeId: row.createdDomainNodeId ?? null,
  };
}

function toDomainSupersessionSuggestion(
  row: typeof domainSupersessionSuggestions.$inferSelect,
): DomainSupersessionSuggestion {
  return {
    id: row.id,
    subjectId: row.subjectId,
    domainNodeId: row.domainNodeId,
    reason: row.reason,
    source: row.source,
    status: row.status as DomainSuggestionStatus,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export interface InsertDomainTopicSuggestionParams {
  subjectId: string;
  proposedParentNodeId: string | null;
  proposedNodeName: string;
  reason: string;
  source: string;
}

export async function insertDomainTopicSuggestion(
  params: InsertDomainTopicSuggestionParams,
  db: DbExecutor = getDb(),
): Promise<DomainTopicSuggestion> {
  const id = newId("dtsug");

  await db.insert(domainTopicSuggestions).values({
    id,
    subjectId: params.subjectId,
    proposedParentNodeId: params.proposedParentNodeId,
    proposedNodeName: params.proposedNodeName,
    reason: params.reason,
    source: params.source,
  });

  const inserted = (
    await db.select().from(domainTopicSuggestions).where(eq(domainTopicSuggestions.id, id))
  )[0]!;

  return toDomainTopicSuggestion(inserted);
}

export async function listDomainTopicSuggestions(
  subjectId: string,
  status?: DomainSuggestionStatus,
): Promise<DomainTopicSuggestion[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(domainTopicSuggestions)
    .where(
      status
        ? and(eq(domainTopicSuggestions.subjectId, subjectId), eq(domainTopicSuggestions.status, status))
        : eq(domainTopicSuggestions.subjectId, subjectId),
    )
    .orderBy(desc(domainTopicSuggestions.createdAt));

  return rows.map(toDomainTopicSuggestion);
}

export async function getDomainTopicSuggestion(
  suggestionId: string,
): Promise<DomainTopicSuggestion | null> {
  const db = getDb();

  const row = (
    await db.select().from(domainTopicSuggestions).where(eq(domainTopicSuggestions.id, suggestionId))
  )[0];

  return row ? toDomainTopicSuggestion(row) : null;
}

export type ResolveDomainSuggestionError = "not_found" | "already_resolved";

// Only the topic resolver can hit this: it is the one that CREATES a
// domain_nodes row, so it is the one that has to care whether the owning
// subject still exists when the lock is finally held.
export type ResolveDomainTopicSuggestionError =
  | ResolveDomainSuggestionError
  | "subject_not_found";

// PATCH /domain-topic-suggestions/:id. Accepting inserts a new domain_nodes
// row under proposed_parent_node_id (already a resolved real id — no
// re-resolution needed) and sets created_domain_node_id + resolved_at on
// the suggestion, in one transaction. Rejecting only resolves the
// suggestion; the row is never deleted (mirrors item 7's Decisions #11).
//
// The suggestion is CLAIMED first, by an UPDATE ... WHERE status = 'pending'
// whose zero-row result is what makes a double accept safe — under READ
// COMMITTED the second transaction blocks on the row lock and then
// re-evaluates that predicate against the committed row, so it can never
// also insert a domain_nodes row and overwrite created_domain_node_id
// (which would orphan the first inserted node). A plain read-then-act, as
// this used to be, lets a double-click produce two real nodes.
//
// The whole claim-and-insert also runs under the owning subject's advisory
// lock (the same one `insertDomainNode` and `createCurriculum` take), so an
// accepted suggestion can no longer create a domain_nodes row under a
// subject a concurrent merge is in the middle of deleting. Learning WHICH
// subject to lock needs a read before the lock, so the suggestion is read
// once outside it purely to pick the key; everything that decides the
// outcome — the subject's existence and the pending claim — is re-read
// inside. The subject check happens BEFORE the claim so that a vanished
// subject leaves the suggestion pending rather than committing it as
// accepted with no node behind it. Rejecting deliberately does not require
// the subject to exist: it only marks a row resolved, and a pending
// suggestion can outlive its subject.
export async function resolveDomainTopicSuggestion(
  suggestionId: string,
  status: "accepted" | "rejected",
): Promise<DomainTopicSuggestion | { error: ResolveDomainTopicSuggestionError }> {
  const db = getDb();

  const preRead = (
    await db.select().from(domainTopicSuggestions).where(eq(domainTopicSuggestions.id, suggestionId))
  )[0];

  if (!preRead) {
    return { error: "not_found" as const };
  }

  return withSubjectLock(preRead.subjectId, async (tx) => {
    const resolvedAt = new Date();

    if (status === "accepted") {
      const subjectRow = (
        await tx.select().from(subjects).where(eq(subjects.id, preRead.subjectId))
      )[0];

      if (!subjectRow) {
        return { error: "subject_not_found" as const };
      }
    }

    const claimed = (
      await tx
        .update(domainTopicSuggestions)
        .set({ status, resolvedAt })
        .where(
          and(
            eq(domainTopicSuggestions.id, suggestionId),
            eq(domainTopicSuggestions.status, "pending"),
          ),
        )
        .returning()
    )[0];

    if (!claimed) {
      const existing = (
        await tx
          .select()
          .from(domainTopicSuggestions)
          .where(eq(domainTopicSuggestions.id, suggestionId))
      )[0];

      return { error: existing ? ("already_resolved" as const) : ("not_found" as const) };
    }

    if (status === "rejected") {
      return toDomainTopicSuggestion(claimed);
    }

    const nodeId = newId("dnode");

    await tx.insert(domainNodes).values({
      id: nodeId,
      subjectId: claimed.subjectId,
      parentId: claimed.proposedParentNodeId,
      name: claimed.proposedNodeName,
      order: 0,
    });

    await tx
      .update(domainTopicSuggestions)
      .set({ createdDomainNodeId: nodeId })
      .where(eq(domainTopicSuggestions.id, suggestionId));

    return toDomainTopicSuggestion({ ...claimed, createdDomainNodeId: nodeId });
  });
}

export interface InsertDomainSupersessionSuggestionParams {
  subjectId: string;
  domainNodeId: string;
  reason: string;
  source: string;
}

export async function insertDomainSupersessionSuggestion(
  params: InsertDomainSupersessionSuggestionParams,
  db: DbExecutor = getDb(),
): Promise<DomainSupersessionSuggestion> {
  const id = newId("dssug");

  await db.insert(domainSupersessionSuggestions).values({
    id,
    subjectId: params.subjectId,
    domainNodeId: params.domainNodeId,
    reason: params.reason,
    source: params.source,
  });

  const inserted = (
    await db
      .select()
      .from(domainSupersessionSuggestions)
      .where(eq(domainSupersessionSuggestions.id, id))
  )[0]!;

  return toDomainSupersessionSuggestion(inserted);
}

export async function listDomainSupersessionSuggestions(
  subjectId: string,
  status?: DomainSuggestionStatus,
): Promise<DomainSupersessionSuggestion[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(domainSupersessionSuggestions)
    .where(
      status
        ? and(
            eq(domainSupersessionSuggestions.subjectId, subjectId),
            eq(domainSupersessionSuggestions.status, status),
          )
        : eq(domainSupersessionSuggestions.subjectId, subjectId),
    )
    .orderBy(desc(domainSupersessionSuggestions.createdAt));

  return rows.map(toDomainSupersessionSuggestion);
}

export async function getDomainSupersessionSuggestion(
  suggestionId: string,
): Promise<DomainSupersessionSuggestion | null> {
  const db = getDb();

  const row = (
    await db
      .select()
      .from(domainSupersessionSuggestions)
      .where(eq(domainSupersessionSuggestions.id, suggestionId))
  )[0];

  return row ? toDomainSupersessionSuggestion(row) : null;
}

// PATCH /domain-supersession-suggestions/:id. Accepting writes a FLAG
// (superseded_at/superseded_reason), never touches percent — the only write
// path to those two columns (spec.md's Decisions #2). Rejecting only
// resolves the suggestion; the node is never touched. Same claim-first
// pending guard as resolveDomainTopicSuggestion above, so a second accept
// cannot re-stamp superseded_at with a later timestamp.
export async function resolveDomainSupersessionSuggestion(
  suggestionId: string,
  status: "accepted" | "rejected",
): Promise<DomainSupersessionSuggestion | { error: ResolveDomainSuggestionError }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const resolvedAt = new Date();

    const claimed = (
      await tx
        .update(domainSupersessionSuggestions)
        .set({ status, resolvedAt })
        .where(
          and(
            eq(domainSupersessionSuggestions.id, suggestionId),
            eq(domainSupersessionSuggestions.status, "pending"),
          ),
        )
        .returning()
    )[0];

    if (!claimed) {
      const existing = (
        await tx
          .select()
          .from(domainSupersessionSuggestions)
          .where(eq(domainSupersessionSuggestions.id, suggestionId))
      )[0];

      return { error: existing ? ("already_resolved" as const) : ("not_found" as const) };
    }

    if (status === "accepted") {
      await tx
        .update(domainNodes)
        .set({ supersededAt: resolvedAt, supersededReason: claimed.reason })
        .where(eq(domainNodes.id, claimed.domainNodeId));
    }

    return toDomainSupersessionSuggestion(claimed);
  });
}

// doc-changelog-scan (issue #49) — the per-subject, per-tool watermark
// (tracked_tool_scan_state). null last_content_hash = never successfully
// scanned. The subjectId half of the key is what keeps a scheduled run's
// second subject from reading the first subject's already-advanced hash and
// concluding nothing changed.
export async function getTrackedToolScanState(
  subjectId: string,
  toolKey: string,
  db: DbExecutor = getDb(),
): Promise<{ subjectId: string; toolKey: string; lastContentHash: string | null } | null> {
  const row = (
    await db
      .select()
      .from(trackedToolScanState)
      .where(
        and(
          eq(trackedToolScanState.subjectId, subjectId),
          eq(trackedToolScanState.toolKey, toolKey),
        ),
      )
  )[0];

  return row
    ? { subjectId: row.subjectId, toolKey: row.toolKey, lastContentHash: row.lastContentHash ?? null }
    : null;
}

// Upserted only for tools INCLUDED in a successful agent call (spec.md's
// Decisions #9) — never called for a tool whose content was unchanged
// (already correct) or whose changed content was part of a FAILED agent
// call (must stay retryable — SCENARIO 10).
export async function upsertTrackedToolScanState(
  subjectId: string,
  toolKey: string,
  contentHash: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const now = new Date();

  await db
    .insert(trackedToolScanState)
    .values({ subjectId, toolKey, lastContentHash: contentHash, lastScannedAt: now })
    .onConflictDoUpdate({
      target: [trackedToolScanState.subjectId, trackedToolScanState.toolKey],
      set: { lastContentHash: contentHash, lastScannedAt: now },
    });
}

// The cron wrapper's subject-gating precedent (spec.md's Scan mechanism,
// same gating item 7 already established) — every subjectId with at least
// one domain_nodes row, deduplicated.
export async function listSubjectIdsWithDomainNodes(): Promise<string[]> {
  const db = getDb();

  const rows = await db
    .selectDistinct({ subjectId: domainNodes.subjectId })
    .from(domainNodes);

  return rows.map((row) => row.subjectId);
}
