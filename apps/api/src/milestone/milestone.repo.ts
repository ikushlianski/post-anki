import { and, desc, eq, inArray } from "drizzle-orm";
import { domainNodeProgress, isComplete, moduleProgress } from "@post-anki/core";
import type { DomainNodeCurriculumTopics, DomainNodeRef } from "@post-anki/core";
import type { Milestone, MilestoneEntityType, Topic } from "@post-anki/shared";
import { FULL_MASTERY_CRITERIA_KEY } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, curriculumDomainNodeMappings, domainNodes, milestones, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

export interface MilestoneRef {
  entityType: MilestoneEntityType;
  entityId: string;
  criteriaKey: string;
}

export function milestoneKey(ref: MilestoneRef): string {
  return `${ref.entityType}:${ref.entityId}:${ref.criteriaKey}`;
}

type TopicRow = typeof topics.$inferSelect;

// Same minimal conversion apps/api/src/analytics/analytics.repo.ts's own
// toTopicForProgress uses — only the fields moduleProgress/domainNodeProgress
// actually read (included, progress.status, progress.maturity) matter here;
// duplicated rather than imported since apps/api/src/analytics/ belongs to a
// different module running concurrently tonight.
function toTopicForProgress(row: TopicRow): Topic {
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

function groupTopicsByCurriculumId(rows: TopicRow[]): Map<string, TopicRow[]> {
  const byId = new Map<string, TopicRow[]>();

  for (const row of rows) {
    const list = byId.get(row.curriculumId) ?? [];
    list.push(row);
    byId.set(row.curriculumId, list);
  }

  return byId;
}

export interface CompletionCandidate {
  entityId: string;
  percent: number;
}

// Curriculum-level completion candidates — one entry per confirmed
// curriculum (Scenario 2's wording: "every confirmed curriculum"; confirmed
// is the terminal happy-path status, set once by confirmCurriculum and never
// reversed — a draft/curating/shaping_structure curriculum has no stable
// structure to be "100% mastered" against). Reuses moduleProgress()
// unmodified — the exact same calculation the curriculum detail page
// already shows.
export async function getCurriculumCompletionCandidates(
  db: DbExecutor = getDb(),
): Promise<CompletionCandidate[]> {
  const curriculumRows = await db
    .select({ id: curricula.id })
    .from(curricula)
    .where(eq(curricula.status, "confirmed"));

  if (curriculumRows.length === 0) {
    return [];
  }

  const curriculumIds = curriculumRows.map((row) => row.id);
  const topicRows = await db.select().from(topics).where(inArray(topics.curriculumId, curriculumIds));
  const topicsByCurriculumId = groupTopicsByCurriculumId(topicRows);

  return curriculumRows.map((row) => ({
    entityId: row.id,
    percent: moduleProgress((topicsByCurriculumId.get(row.id) ?? []).map(toTopicForProgress)).percent,
  }));
}

// Area-level completion candidates — one entry per `domain_nodes.kind =
// 'area'` row (Web Development's fixed Areas only, v1 scope), reusing
// domainNodeProgress() unmodified — the same subtree rollup the domain map
// and Module 4's coverage report already call. Deliberately calls
// domainNodeProgress directly rather than importing
// apps/api/src/analytics/'s getCoverageInputs/buildCoverageReport wiring:
// that folder belongs to a different module running concurrently tonight,
// and domainNodeProgress is the actual reused rollup either path bottoms
// out in.
export async function getAreaCompletionCandidates(
  db: DbExecutor = getDb(),
): Promise<CompletionCandidate[]> {
  const areaRows = await db.select().from(domainNodes).where(eq(domainNodes.kind, "area"));

  if (areaRows.length === 0) {
    return [];
  }

  const subjectIds = [...new Set(areaRows.map((row) => row.subjectId))];

  const [nodeRows, subjectCurricula] = await Promise.all([
    db
      .select({ id: domainNodes.id, parentId: domainNodes.parentId })
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

  const topicsByCurriculumId = groupTopicsByCurriculumId(topicRows);

  const curriculumTopics: DomainNodeCurriculumTopics[] = confirmedMappings.map((mapping) => ({
    domainNodeId: mapping.domainNodeId,
    topics: (topicsByCurriculumId.get(mapping.curriculumId) ?? []).map(toTopicForProgress),
  }));

  const nodes: DomainNodeRef[] = nodeRows.map((row) => ({ id: row.id, parentId: row.parentId }));

  return areaRows.map((area) => ({
    entityId: area.id,
    percent: domainNodeProgress(area.id, nodes, curriculumTopics).percent,
  }));
}

export async function listMilestoneKeys(db: DbExecutor = getDb()): Promise<Set<string>> {
  const rows = await db
    .select({
      entityType: milestones.entityType,
      entityId: milestones.entityId,
      criteriaKey: milestones.criteriaKey,
    })
    .from(milestones);

  return new Set(
    rows.map((row) =>
      milestoneKey({
        entityType: row.entityType as MilestoneEntityType,
        entityId: row.entityId,
        criteriaKey: row.criteriaKey,
      }),
    ),
  );
}

// Insert-if-not-exists (Scenario 3): a pre-check-free insert attempt whose
// real duplicate guard is the DB's own unique index on (entityType,
// entityId, criteriaKey) — a losing concurrent insert's 23505 is caught
// here and treated as "already awarded, nothing to do" (Scenario 4), never
// surfaced as an error. Never updates or deletes an existing row (Scenario
// 7) — this function only ever inserts or no-ops.
export async function awardIfNew(
  ref: MilestoneRef,
  achievedAt: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<boolean> {
  try {
    await db.insert(milestones).values({
      id: newId("mstn"),
      entityType: ref.entityType,
      entityId: ref.entityId,
      criteriaKey: ref.criteriaKey,
      achievedAt: new Date(achievedAt),
    });

    return true;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return false;
    }

    throw err;
  }
}

// The single side-effecting entry point (Scenario 5): reachable only from
// GET /milestones's own controller handler, never a cron, scheduler, or
// answer-submission code path. Pre-filters against already-awarded keys
// before attempting any insert — cheap for the common case where most
// completions were already recorded on an earlier read — but the actual
// concurrent-double-award guard is awardIfNew's DB unique index, not this
// filter (two simultaneous evaluate calls can both pass this filter for the
// same entity; only one of their inserts wins).
export async function evaluateAndAwardMilestones(
  now: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<void> {
  const [existingKeys, curriculumCandidates, areaCandidates] = await Promise.all([
    listMilestoneKeys(db),
    getCurriculumCompletionCandidates(db),
    getAreaCompletionCandidates(db),
  ]);

  const newlyComplete: MilestoneRef[] = [
    ...curriculumCandidates
      .filter((candidate) => isComplete(candidate.percent))
      .map((candidate) => ({
        entityType: "curriculum" as const,
        entityId: candidate.entityId,
        criteriaKey: FULL_MASTERY_CRITERIA_KEY,
      })),
    ...areaCandidates
      .filter((candidate) => isComplete(candidate.percent))
      .map((candidate) => ({
        entityType: "domain_node" as const,
        entityId: candidate.entityId,
        criteriaKey: FULL_MASTERY_CRITERIA_KEY,
      })),
  ].filter((ref) => !existingKeys.has(milestoneKey(ref)));

  await Promise.all(newlyComplete.map((ref) => awardIfNew(ref, now, db)));
}

function toMilestone(row: typeof milestones.$inferSelect, entityLabel: string | null): Milestone {
  return {
    id: row.id,
    entityType: row.entityType as MilestoneEntityType,
    entityId: row.entityId,
    entityLabel,
    criteriaKey: row.criteriaKey,
    achievedAt: row.achievedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// The read path (Scenario 6): reads only the milestones table's own rows
// plus a current-name lookup for display — it never re-derives or
// re-validates against the entity's current live percent, so a later
// structural change that drops the live percent below the threshold cannot
// touch an already-awarded row. entityLabel is resolved fresh every read
// (display metadata, not part of the completion fact) and falls back to
// null if the underlying curriculum/domain node was since deleted (Scenario
// 7 — deletion never cascades to milestones, so the award must still
// render even without a name).
export async function listMilestones(db: DbExecutor = getDb()): Promise<Milestone[]> {
  const rows = await db.select().from(milestones).orderBy(desc(milestones.achievedAt));

  if (rows.length === 0) {
    return [];
  }

  const curriculumIds = rows.filter((row) => row.entityType === "curriculum").map((row) => row.entityId);
  const domainNodeIds = rows
    .filter((row) => row.entityType === "domain_node")
    .map((row) => row.entityId);

  const [curriculumRows, domainNodeRows] = await Promise.all([
    curriculumIds.length > 0
      ? db.select({ id: curricula.id, name: curricula.name }).from(curricula).where(inArray(curricula.id, curriculumIds))
      : Promise.resolve([]),
    domainNodeIds.length > 0
      ? db
          .select({ id: domainNodes.id, name: domainNodes.name })
          .from(domainNodes)
          .where(inArray(domainNodes.id, domainNodeIds))
      : Promise.resolve([]),
  ]);

  const curriculumNameById = new Map(curriculumRows.map((row) => [row.id, row.name]));
  const domainNodeNameById = new Map(domainNodeRows.map((row) => [row.id, row.name]));

  return rows.map((row) =>
    toMilestone(
      row,
      row.entityType === "curriculum"
        ? (curriculumNameById.get(row.entityId) ?? null)
        : (domainNodeNameById.get(row.entityId) ?? null),
    ),
  );
}
