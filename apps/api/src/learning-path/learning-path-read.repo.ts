import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { domainNodePrerequisites, domainNodes, learningPathSteps, learningPaths, subjects } from "../db/schema.js";
import type { NamedNode } from "../domain-map/domain-node-name-resolver.js";

export interface LearningPathRecord {
  id: string;
  name: string;
  targetRoleLabel: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface LearningPathStepRecord {
  id: string;
  pathId: string;
  domainNodeId: string;
  order: number;
  createdAt: string;
}

export function toLearningPath(row: typeof learningPaths.$inferSelect): LearningPathRecord {
  return {
    id: row.id,
    name: row.name,
    targetRoleLabel: row.targetRoleLabel,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export function toLearningPathStep(row: typeof learningPathSteps.$inferSelect): LearningPathStepRecord {
  return {
    id: row.id,
    pathId: row.pathId,
    domainNodeId: row.domainNodeId,
    order: row.order,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getSubjectIdByName(name: string): Promise<string | null> {
  const row = (
    await getDb().select({ id: subjects.id }).from(subjects).where(eq(subjects.name, name))
  )[0];

  return row?.id ?? null;
}

export async function listNamedNodesForSubject(subjectId: string): Promise<NamedNode[]> {
  return getDb()
    .select({ id: domainNodes.id, parentId: domainNodes.parentId, name: domainNodes.name })
    .from(domainNodes)
    .where(eq(domainNodes.subjectId, subjectId));
}

export async function getNodeOrdersByIds(
  nodeIds: string[],
): Promise<{ id: string; order: number }[]> {
  if (nodeIds.length === 0) {
    return [];
  }

  return getDb()
    .select({ id: domainNodes.id, order: domainNodes.order })
    .from(domainNodes)
    .where(inArray(domainNodes.id, nodeIds));
}

export async function listPrerequisiteEdgesAmongNodes(
  nodeIds: string[],
): Promise<{ domainNodeId: string; prerequisiteNodeId: string }[]> {
  if (nodeIds.length === 0) {
    return [];
  }

  return getDb()
    .select({
      domainNodeId: domainNodePrerequisites.domainNodeId,
      prerequisiteNodeId: domainNodePrerequisites.prerequisiteNodeId,
    })
    .from(domainNodePrerequisites)
    .where(inArray(domainNodePrerequisites.domainNodeId, nodeIds));
}

export async function getLearningPath(
  pathId: string,
): Promise<{ path: LearningPathRecord; steps: LearningPathStepRecord[] } | null> {
  const db = getDb();

  const pathRow = (await db.select().from(learningPaths).where(eq(learningPaths.id, pathId)))[0];

  if (!pathRow) {
    return null;
  }

  const stepRows = await db
    .select()
    .from(learningPathSteps)
    .where(eq(learningPathSteps.pathId, pathId))
    .orderBy(asc(learningPathSteps.order));

  return { path: toLearningPath(pathRow), steps: stepRows.map(toLearningPathStep) };
}

export async function listLearningPaths(params?: {
  excludeAbandoned?: boolean;
}): Promise<LearningPathRecord[]> {
  const db = getDb();

  const rows = params?.excludeAbandoned
    ? await db.select().from(learningPaths).where(eq(learningPaths.status, "active"))
    : await db.select().from(learningPaths);

  return rows.map(toLearningPath);
}
