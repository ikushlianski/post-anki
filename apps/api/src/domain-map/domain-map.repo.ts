import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type {
  DepthLevel,
  DomainNode,
  DomainNodeTreeItem,
  DomainPrioritySuggestion,
  DomainPrioritySuggestionStatus,
  DomainSuggestionStatus,
  DomainSupersessionSuggestion,
  DomainTopicSuggestion,
  Topic,
} from "@post-anki/shared";
import { domainNodeProgress, domainPriorityDistance } from "@post-anki/core";
import { getDb } from "../db/client.js";
import {
  curricula,
  domainNodes,
  domainPrioritySuggestions,
  domainSupersessionSuggestions,
  domainTopicSuggestions,
  topics,
  trackedToolScanState,
} from "../db/schema.js";
import { newId } from "../shared/id.js";

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

export async function insertDomainNode(params: {
  subjectId: string;
  parentId: string | null;
  name: string;
  description?: string | null;
  order?: number;
}): Promise<DomainNode> {
  const row = {
    id: newId("dnode"),
    subjectId: params.subjectId,
    parentId: params.parentId,
    name: params.name,
    description: params.description ?? null,
    order: params.order ?? 0,
  };

  await getDb().insert(domainNodes).values(row);

  const inserted = (
    await getDb().select().from(domainNodes).where(eq(domainNodes.id, row.id))
  )[0]!;

  return toDomainNode(inserted);
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

// GET /subjects/:id/domain-map's read path: two flat queries (domain_nodes
// for the subject, curricula-with-modules-with-topics for the subject that
// have a non-null domain_node_id) — never a recursive CTE, never N+1,
// regardless of tree depth — assembled and rolled up in memory via the pure
// domainNodeProgress() deriver. No agent, no LLM call anywhere in this path.
export async function getDomainMapForSubject(subjectId: string): Promise<DomainNodeTreeItem[]> {
  const db = getDb();

  const nodeRows = await db.select().from(domainNodes).where(eq(domainNodes.subjectId, subjectId));

  const placedCurricula = await db
    .select()
    .from(curricula)
    .where(and(eq(curricula.subjectId, subjectId), isNotNull(curricula.domainNodeId)));

  const curriculumIds = placedCurricula.map((c) => c.id);

  const topicRows = curriculumIds.length
    ? await db.select().from(topics).where(inArray(topics.curriculumId, curriculumIds))
    : [];

  const topicsByCurriculumId = new Map<string, typeof topics.$inferSelect[]>();

  for (const topicRow of topicRows) {
    const list = topicsByCurriculumId.get(topicRow.curriculumId) ?? [];
    list.push(topicRow);
    topicsByCurriculumId.set(topicRow.curriculumId, list);
  }

  const curriculumTopics = placedCurricula.map((curriculum) => ({
    domainNodeId: curriculum.domainNodeId!,
    topics: (topicsByCurriculumId.get(curriculum.id) ?? []).map(toTopicForProgress),
  }));

  const curriculaByNodeId = new Map<string, { id: string; name: string }[]>();

  for (const curriculum of placedCurricula) {
    const list = curriculaByNodeId.get(curriculum.domainNodeId!) ?? [];
    list.push({ id: curriculum.id, name: curriculum.name });
    curriculaByNodeId.set(curriculum.domainNodeId!, list);
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
    };
  }

  return nodeRows
    .filter((row) => row.parentId === null)
    .sort((a, b) => a.order - b.order)
    .map(buildItem);
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
): Promise<DomainTopicSuggestion> {
  const db = getDb();
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

// PATCH /domain-topic-suggestions/:id. Accepting inserts a new domain_nodes
// row under proposed_parent_node_id (already a resolved real id — no
// re-resolution needed) and sets created_domain_node_id + resolved_at on
// the suggestion, in one transaction. Rejecting only resolves the
// suggestion; the row is never deleted (mirrors item 7's Decisions #11).
export async function resolveDomainTopicSuggestion(
  suggestionId: string,
  status: "accepted" | "rejected",
): Promise<DomainTopicSuggestion | null> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select()
        .from(domainTopicSuggestions)
        .where(eq(domainTopicSuggestions.id, suggestionId))
    )[0];

    if (!existing) {
      return null;
    }

    const resolvedAt = new Date();
    let createdDomainNodeId: string | null = existing.createdDomainNodeId ?? null;

    if (status === "accepted") {
      const nodeId = newId("dnode");

      await tx.insert(domainNodes).values({
        id: nodeId,
        subjectId: existing.subjectId,
        parentId: existing.proposedParentNodeId,
        name: existing.proposedNodeName,
        order: 0,
      });

      createdDomainNodeId = nodeId;
    }

    await tx
      .update(domainTopicSuggestions)
      .set({ status, resolvedAt, createdDomainNodeId })
      .where(eq(domainTopicSuggestions.id, suggestionId));

    return toDomainTopicSuggestion({
      ...existing,
      status,
      resolvedAt,
      createdDomainNodeId,
    });
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
): Promise<DomainSupersessionSuggestion> {
  const db = getDb();
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
// resolves the suggestion; the node is never touched.
export async function resolveDomainSupersessionSuggestion(
  suggestionId: string,
  status: "accepted" | "rejected",
): Promise<DomainSupersessionSuggestion | null> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select()
        .from(domainSupersessionSuggestions)
        .where(eq(domainSupersessionSuggestions.id, suggestionId))
    )[0];

    if (!existing) {
      return null;
    }

    const resolvedAt = new Date();

    await tx
      .update(domainSupersessionSuggestions)
      .set({ status, resolvedAt })
      .where(eq(domainSupersessionSuggestions.id, suggestionId));

    if (status === "accepted") {
      await tx
        .update(domainNodes)
        .set({ supersededAt: resolvedAt, supersededReason: existing.reason })
        .where(eq(domainNodes.id, existing.domainNodeId));
    }

    return toDomainSupersessionSuggestion({ ...existing, status, resolvedAt });
  });
}

// doc-changelog-scan (issue #49) — the per-tool watermark
// (tracked_tool_scan_state). null last_content_hash = never successfully
// scanned.
export async function getTrackedToolScanState(
  toolKey: string,
): Promise<{ toolKey: string; lastContentHash: string | null } | null> {
  const db = getDb();

  const row = (
    await db
      .select()
      .from(trackedToolScanState)
      .where(eq(trackedToolScanState.toolKey, toolKey))
  )[0];

  return row ? { toolKey: row.toolKey, lastContentHash: row.lastContentHash ?? null } : null;
}

// Upserted only for tools INCLUDED in a successful agent call (spec.md's
// Decisions #9) — never called for a tool whose content was unchanged
// (already correct) or whose changed content was part of a FAILED agent
// call (must stay retryable — SCENARIO 10).
export async function upsertTrackedToolScanState(
  toolKey: string,
  contentHash: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db
    .insert(trackedToolScanState)
    .values({ toolKey, lastContentHash: contentHash, lastScannedAt: now })
    .onConflictDoUpdate({
      target: trackedToolScanState.toolKey,
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
