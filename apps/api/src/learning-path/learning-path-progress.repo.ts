import { and, eq, inArray } from "drizzle-orm";
import type { DepthLevel, Topic } from "@post-anki/shared";
import type { DomainNodeCurriculumTopics, DomainNodeRef, PushCandidate } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { curricula, curriculumDomainNodeMappings, domainNodes, gaps, topics } from "../db/schema.js";
import { rowToGap } from "../gap/gap.repo.js";
import { listDormantEntityIds } from "../liveness/liveness.repo.js";

export interface PathProgressInputs {
  nodes: DomainNodeRef[];
  curriculumTopics: DomainNodeCurriculumTopics[];
}

export async function gatherPathProgressInputs(
  stepDomainNodeIds: string[],
): Promise<PathProgressInputs> {
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

  const topicsByCurriculumId = new Map<string, (typeof topics.$inferSelect)[]>();

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
        lastInteractedAt: row.progressLastInteractedAt
          ? row.progressLastInteractedAt.toISOString()
          : null,
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
  const curriculumSubjectId = new Map(liveCurricula.map((c) => [c.id, c.subjectId]));
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
    .where(
      inArray(
        gaps.topicId,
        topicRows.map((t) => t.id),
      ),
    );

  return topicRows.map((t) => ({
    topicId: t.id,
    topicTitle: t.title,
    curriculumId: t.curriculumId,
    curriculumName: curriculumName.get(t.curriculumId) ?? "",
    subjectId: curriculumSubjectId.get(t.curriculumId) ?? "",
    depth: t.depth as DepthLevel,
    gaps: gapRows.filter((g) => g.topicId === t.id).map((g) => rowToGap(g)),
  }));
}
