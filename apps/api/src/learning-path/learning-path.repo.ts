import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DepthLevel, Topic } from "@post-anki/shared";
import type { DomainNodeCurriculumTopics, DomainNodeRef, PushCandidate } from "@post-anki/core";
import { getDb } from "../db/client.js";
import {
  curricula,
  curriculumDomainNodeMappings,
  domainNodePrerequisites,
  domainNodes,
  gaps,
  learningPathSteps,
  learningPaths,
  subjects,
  topics,
} from "../db/schema.js";
import { newId } from "../shared/id.js";
import { rowToGap } from "../gap/gap.repo.js";
import { listDormantEntityIds } from "../liveness/liveness.repo.js";
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

function toLearningPath(row: typeof learningPaths.$inferSelect): LearningPathRecord {
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

function toLearningPathStep(row: typeof learningPathSteps.$inferSelect): LearningPathStepRecord {
  return {
    id: row.id,
    pathId: row.pathId,
    domainNodeId: row.domainNodeId,
    order: row.order,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getSubjectIdByName(name: string): Promise<string | null> {
  const row = (await getDb().select({ id: subjects.id }).from(subjects).where(eq(subjects.name, name)))[0];

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

export interface CreateLearningPathParams {
  name: string;
  targetRoleLabel: string;
  orderedDomainNodeIds: string[];
}

export async function insertLearningPath(
  params: CreateLearningPathParams,
): Promise<{ path: LearningPathRecord; steps: LearningPathStepRecord[] }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const now = new Date();

    const insertedPath = (
      await tx
        .insert(learningPaths)
        .values({
          id: newId("lpath"),
          name: params.name,
          targetRoleLabel: params.targetRoleLabel,
          status: "active",
          startedAt: now,
        })
        .returning()
    )[0]!;

    const stepRows =
      params.orderedDomainNodeIds.length > 0
        ? await tx
            .insert(learningPathSteps)
            .values(
              params.orderedDomainNodeIds.map((domainNodeId, index) => ({
                id: newId("lstep"),
                pathId: insertedPath.id,
                domainNodeId,
                order: index,
              })),
            )
            .returning()
        : [];

    return {
      path: toLearningPath(insertedPath),
      steps: stepRows.map(toLearningPathStep),
    };
  });
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

export async function abandonLearningPath(pathId: string): Promise<LearningPathRecord | null> {
  const db = getDb();

  const updated = (
    await db
      .update(learningPaths)
      .set({ status: "abandoned" })
      .where(eq(learningPaths.id, pathId))
      .returning()
  )[0];

  return updated ? toLearningPath(updated) : null;
}

export async function markLearningPathCompletedIfDue(
  pathId: string,
  completedAt: Date,
): Promise<void> {
  const db = getDb();

  await db
    .update(learningPaths)
    .set({ status: "completed", completedAt })
    .where(
      and(eq(learningPaths.id, pathId), eq(learningPaths.status, "active"), isNull(learningPaths.completedAt)),
    );
}

export interface PathProgressInputs {
  nodes: DomainNodeRef[];
  curriculumTopics: DomainNodeCurriculumTopics[];
}

export async function gatherPathProgressInputs(stepDomainNodeIds: string[]): Promise<PathProgressInputs> {
  if (stepDomainNodeIds.length === 0) {
    return { nodes: [], curriculumTopics: [] };
  }

  const db = getDb();

  const stepNodeRows = await db
    .select({ subjectId: domainNodes.subjectId })
    .from(domainNodes)
    .where(inArray(domainNodes.id, stepDomainNodeIds));

  const subjectIds = [...new Set(stepNodeRows.map((row) => row.subjectId))];

  if (subjectIds.length === 0) {
    return { nodes: [], curriculumTopics: [] };
  }

  const [nodeRows, subjectCurricula] = await Promise.all([
    db
      .select({ id: domainNodes.id, parentId: domainNodes.parentId })
      .from(domainNodes)
      .where(inArray(domainNodes.subjectId, subjectIds)),
    db.select({ id: curricula.id }).from(curricula).where(inArray(curricula.subjectId, subjectIds)),
  ]);

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
    topics: (topicsByCurriculumId.get(mapping.curriculumId) ?? []).map((row) => ({
      id: row.id,
      moduleId: row.moduleId,
      title: row.title,
      order: row.order,
      priority: row.priority as Topic["priority"],
      included: row.included,
      selfGrade: row.selfGrade,
      depth: row.depth as DepthLevel,
      learningStatus: row.learningStatus as Topic["learningStatus"],
      questions: [],
      progress: {
        status: row.progressStatus as Topic["progress"]["status"],
        maturity: row.progressMaturity,
        attempts: row.progressAttempts,
        lastInteractedAt: row.progressLastInteractedAt ? row.progressLastInteractedAt.toISOString() : null,
      },
      depthElectedAt: row.depthElectedAt ? row.depthElectedAt.toISOString() : null,
    })),
  }));

  return { nodes: nodeRows, curriculumTopics };
}

export async function gatherStepPushCandidates(subtreeNodeIds: string[]): Promise<PushCandidate[]> {
  if (subtreeNodeIds.length === 0) {
    return [];
  }

  const db = getDb();

  const [mappings, dormantCurriculumIds] = await Promise.all([
    db
      .select()
      .from(curriculumDomainNodeMappings)
      .where(
        and(
          inArray(curriculumDomainNodeMappings.domainNodeId, subtreeNodeIds),
          eq(curriculumDomainNodeMappings.status, "confirmed"),
        ),
      ),
    listDormantEntityIds("curriculum"),
  ]);

  const curriculumIds = [...new Set(mappings.map((mapping) => mapping.curriculumId))];

  if (curriculumIds.length === 0) {
    return [];
  }

  const confirmedCurricula = await db
    .select()
    .from(curricula)
    .where(and(inArray(curricula.id, curriculumIds), eq(curricula.status, "confirmed")));

  const liveCurricula = confirmedCurricula.filter((c) => !dormantCurriculumIds.has(c.id));

  if (liveCurricula.length === 0) {
    return [];
  }

  const curriculumName = new Map(liveCurricula.map((c) => [c.id, c.name]));
  const liveCurriculumIds = liveCurricula.map((c) => c.id);

  const topicRows = (
    await db.select().from(topics).where(inArray(topics.curriculumId, liveCurriculumIds))
  ).filter((t) => t.included);

  if (topicRows.length === 0) {
    return [];
  }

  const gapRows = await db
    .select()
    .from(gaps)
    .where(inArray(gaps.topicId, topicRows.map((t) => t.id)));

  return topicRows.map((t) => ({
    topicId: t.id,
    topicTitle: t.title,
    curriculumId: t.curriculumId,
    curriculumName: curriculumName.get(t.curriculumId) ?? "",
    depth: t.depth as DepthLevel,
    gaps: gapRows.filter((g) => g.topicId === t.id).map((g) => rowToGap(g)),
  }));
}
