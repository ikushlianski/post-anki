import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { Topic } from "@post-anki/shared";
import type { DomainNodeCurriculumTopics, DomainNodeRef } from "@post-anki/core";
import { getDb } from "../db/client.js";
import {
  curricula,
  curriculumDomainNodeMappings,
  domainNodes,
  gapMastery,
  gaps,
  probeSessionQuestions,
  topics,
} from "../db/schema.js";

export interface GapMasteryTimingRow {
  gapId: string;
  topicId: string;
  createdAt: string;
  masteredAt: string | null;
}

export async function listGapMasteryTimings(since?: Date): Promise<GapMasteryTimingRow[]> {
  const db = getDb();
  const conditions = since ? [gte(gapMastery.masteredAt, since)] : [];

  const rows = await db
    .select({
      gapId: gapMastery.gapId,
      topicId: gaps.topicId,
      createdAt: gapMastery.createdAt,
      masteredAt: gapMastery.masteredAt,
    })
    .from(gapMastery)
    .innerJoin(gaps, eq(gapMastery.gapId, gaps.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map((row) => ({
    gapId: row.gapId,
    topicId: row.topicId,
    createdAt: row.createdAt.toISOString(),
    masteredAt: row.masteredAt ? row.masteredAt.toISOString() : null,
  }));
}

export async function listMasteredAtByGapId(): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ gapId: gapMastery.gapId, masteredAt: gapMastery.masteredAt })
    .from(gapMastery)
    .where(isNotNull(gapMastery.masteredAt));

  return new Map(rows.map((row) => [row.gapId, row.masteredAt!.toISOString()]));
}

export interface ProbeAnswerRow {
  gapId: string;
  topicId: string | null;
  answeredAt: string;
  outcome: "pass" | "fail";
}

export async function listAnsweredProbeSessionQuestionsForGaps(
  since?: Date,
): Promise<ProbeAnswerRow[]> {
  const db = getDb();
  const conditions = [isNotNull(probeSessionQuestions.gapId), isNotNull(probeSessionQuestions.answeredAt)];

  if (since) {
    conditions.push(gte(probeSessionQuestions.answeredAt, since));
  }

  const rows = await db
    .select({
      gapId: probeSessionQuestions.gapId,
      topicId: probeSessionQuestions.topicId,
      answeredAt: probeSessionQuestions.answeredAt,
      outcome: probeSessionQuestions.outcome,
    })
    .from(probeSessionQuestions)
    .where(and(...conditions));

  return rows
    .filter(
      (row) => row.gapId !== null && row.answeredAt !== null && row.outcome !== null,
    )
    .map((row) => ({
      gapId: row.gapId!,
      topicId: row.topicId,
      answeredAt: row.answeredAt!.toISOString(),
      outcome: row.outcome as "pass" | "fail",
    }));
}

export interface GapTopicRow {
  gapId: string;
  topicId: string;
}

export async function listGapTopicLinks(): Promise<GapTopicRow[]> {
  return getDb().select({ gapId: gaps.id, topicId: gaps.topicId }).from(gaps);
}

export interface TopicAreaRow {
  topicId: string;
  areaId: string;
}

export async function listTopicAreaLinks(): Promise<TopicAreaRow[]> {
  const rows = await getDb()
    .select({ topicId: topics.id, areaId: curriculumDomainNodeMappings.domainNodeId })
    .from(curriculumDomainNodeMappings)
    .innerJoin(domainNodes, eq(curriculumDomainNodeMappings.domainNodeId, domainNodes.id))
    .innerJoin(topics, eq(topics.curriculumId, curriculumDomainNodeMappings.curriculumId))
    .where(and(eq(curriculumDomainNodeMappings.status, "confirmed"), eq(domainNodes.kind, "area")));

  return rows;
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
    depthElectedAt: row.depthElectedAt ? row.depthElectedAt.toISOString() : null,
  };
}

export interface CoverageAreaNode {
  id: string;
  name: string;
  subjectName: string;
}

export interface CoverageInputs {
  areaNodes: CoverageAreaNode[];
  nodes: DomainNodeRef[];
  curriculumTopics: DomainNodeCurriculumTopics[];
}

export async function getCoverageInputs(): Promise<CoverageInputs> {
  const db = getDb();
  const areaRows = await db.select().from(domainNodes).where(eq(domainNodes.kind, "area"));

  if (areaRows.length === 0) {
    return { areaNodes: [], nodes: [], curriculumTopics: [] };
  }

  const subjectIds = [...new Set(areaRows.map((row) => row.subjectId))];

  const [nodeRows, subjectCurricula] = await Promise.all([
    db
      .select({ id: domainNodes.id, parentId: domainNodes.parentId, name: domainNodes.name })
      .from(domainNodes)
      .where(inArray(domainNodes.subjectId, subjectIds)),
    db.select({ id: curricula.id }).from(curricula).where(inArray(curricula.subjectId, subjectIds)),
  ]);

  const curriculumIds = subjectCurricula.map((row) => row.id);

  const [confirmedMappings, topicRows] = await Promise.all([
    curriculumIds.length > 0
      ? db
          .select()
          .from(curriculumDomainNodeMappings)
          .where(
            and(
              inArray(curriculumDomainNodeMappings.curriculumId, curriculumIds),
              eq(curriculumDomainNodeMappings.status, "confirmed"),
            ),
          )
      : Promise.resolve([]),
    curriculumIds.length > 0
      ? db.select().from(topics).where(inArray(topics.curriculumId, curriculumIds))
      : Promise.resolve([]),
  ]);

  const topicsByCurriculumId = new Map<string, (typeof topics.$inferSelect)[]>();

  for (const row of topicRows) {
    const list = topicsByCurriculumId.get(row.curriculumId) ?? [];
    list.push(row);
    topicsByCurriculumId.set(row.curriculumId, list);
  }

  const curriculumTopics = confirmedMappings.map((mapping) => ({
    domainNodeId: mapping.domainNodeId,
    topics: (topicsByCurriculumId.get(mapping.curriculumId) ?? []).map(toTopicForProgress),
  }));

  const nameById = new Map(nodeRows.map((row) => [row.id, row.name]));

  const areaNodes = areaRows.map((row) => ({
    id: row.id,
    name: row.name,
    subjectName: row.parentId ? (nameById.get(row.parentId) ?? "") : "",
  }));

  return {
    areaNodes,
    nodes: nodeRows.map((row) => ({ id: row.id, parentId: row.parentId })),
    curriculumTopics,
  };
}
