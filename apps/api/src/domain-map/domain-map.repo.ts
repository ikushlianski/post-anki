import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { DomainNode, DomainNodeTreeItem, Topic } from "@post-anki/shared";
import { domainNodeProgress } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { curricula, domainNodes, topics } from "../db/schema.js";
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
      curricula: curriculaByNodeId.get(row.id) ?? [],
      children,
    };
  }

  return nodeRows
    .filter((row) => row.parentId === null)
    .sort((a, b) => a.order - b.order)
    .map(buildItem);
}
