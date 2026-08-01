import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type {
  CreateCurriculumInput,
  Curriculum,
  CurriculumDetail,
  CurriculumOrigin,
  CurriculumStatus,
  DepthLevel,
  Gap,
  LearningMapModuleSnapshot,
  LearningMapSnapshot,
  LearningStatus,
  Level,
  MergeCurriculaResult,
  Module,
  ResearchCandidateApprovalStatus,
  Source,
  SourceDraft,
  Speed,
  SplitSuggestion,
  StructureResearchCandidate,
  StructureTurn,
  StructureTurnRole,
  StructureTurnStatus,
  TagChip,
  Topic,
  TopicProgressStatus,
  UpdateCurriculumInput,
} from "@post-anki/shared";
import {
  curriculumProgress,
  extractUrls,
  moduleProgress,
  priorLevelCoverageLabels,
  recommendedTopicId,
  sortForDisplay,
} from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  curriculumStructureTurns,
  gaps,
  gapMastery,
  modules,
  probeSessions,
  socraticSessions,
  sources,
  structureResearchCandidates,
  subjects,
  topics,
} from "../db/schema.js";
import { rowToGap } from "../gap/gap.repo.js";
import { deleteGapMasteryForGapIds } from "../gap/gap-mastery.repo.js";
import { newId } from "../shared/id.js";
import { withMergeLock, withSubjectLock } from "../shared/merge-lock.js";
import { insertOntologyMergeLog } from "../ontology-merge/ontology-merge.repo.js";
import {
  resolveCurriculumOrigin,
  hasStudyableContent,
  shouldIncludeTopicByDefault,
} from "./curriculum-rules.js";
import {
  getTagsByIds,
  listAssignmentsForNodes,
  resolveOrCreateTag,
  assignTag,
} from "../tag/tag.repo.js";
import type { CurriculumPlan } from "./curriculum-plan.js";
import type { DocResearchPlan } from "./curriculum-research-plan.js";

interface PlanModule {
  title: string;
  level?: Level | null;
  topics: {
    title: string;
    summary: string | null;
    suggestedDepth: DepthLevel;
  }[];
  tags?: string[] | null;
}

interface Plan {
  modules: PlanModule[];
}

export async function listCurricula(subjectId?: string): Promise<Curriculum[]> {
  const rows = (await getDb().select().from(curricula)).filter(
    (r: typeof curricula.$inferSelect) => !subjectId || r.subjectId === subjectId,
  );

  if (rows.length === 0) {
    return [];
  }

  const sourceRows = await getDb()
    .select()
    .from(sources)
    .where(inArray(sources.curriculumId, rows.map((r) => r.id)));

  const kindsByCurriculum = new Map<string, string[]>();

  for (const s of sourceRows) {
    const list = kindsByCurriculum.get(s.curriculumId) ?? [];

    list.push(s.kind);
    kindsByCurriculum.set(s.curriculumId, list);
  }

  return rows.map((r) =>
    toCurriculum(r, resolveCurriculumOrigin(kindsByCurriculum.get(r.id) ?? [])),
  );
}

export type CreateCurriculumError = "subject_not_found";

/**
 * Runs under the subject's advisory lock (the same lock space `mergeSubjects`
 * takes), and re-reads the subject INSIDE that lock rather than trusting the
 * controller's earlier pre-check. Without this, a curriculum created in the
 * window between a concurrent merge's "reassign the source's curricula" step
 * and its "delete the source subject" step was reassigned by neither and left
 * pointing at a subject id that no longer existed — there is no foreign key on
 * curricula.subject_id to catch it, so the orphan was silent.
 *
 * A create that loses this race gets `subject_not_found` — the same clean,
 * catchable outcome (a 404, never a 500) `mergeSubjects` already returns when
 * it loses its own race, rather than a partially-applied write.
 */
export async function createCurriculum(
  input: CreateCurriculumInput,
): Promise<Curriculum | { error: CreateCurriculumError }> {
  const row = {
    id: newId("cur"),
    subjectId: input.subjectId,
    name: input.name,
    description: input.description ?? null,
    status: "curating" as const,
    learningStatus: "not_started" as const,
    speed: "normal" as const,
    hinting: true,
    defaultDepth: "working" as const,
    strictOrder: false,
    preAssessmentCompletedAt: null,
    domainNodeId: input.domainNodeId ?? null,
  };

  return withSubjectLock(input.subjectId, async (tx) => {
    const subjectRow = (
      await tx.select().from(subjects).where(eq(subjects.id, input.subjectId))
    )[0];

    if (!subjectRow) {
      return { error: "subject_not_found" as const };
    }

    await tx.insert(curricula).values(row);

    if (input.sources.length > 0) {
      await tx.insert(sources).values(
        input.sources.map((s) => ({
          id: newId("src"),
          curriculumId: row.id,
          kind: s.kind,
          value: s.value,
          title: s.title ?? null,
        })),
      );
    }

    return toCurriculum(row, "sources");
  });
}

async function originFor(curriculumId: string): Promise<CurriculumOrigin> {
  const rows = await getDb()
    .select()
    .from(sources)
    .where(eq(sources.curriculumId, curriculumId));

  return resolveCurriculumOrigin(rows.map((r) => r.kind));
}

export interface CurriculumProbeContext {
  curriculumId: string;
  status: CurriculumStatus;
  speed: Speed;
  hinting: boolean;
}

export async function getCurriculumContextForTopic(
  topicId: string,
): Promise<CurriculumProbeContext | null> {
  const db = getDb();

  const topicRow = (
    await db.select().from(topics).where(eq(topics.id, topicId))
  )[0];

  if (!topicRow) {
    return null;
  }

  const curriculumRow = (
    await db.select().from(curricula).where(eq(curricula.id, topicRow.curriculumId))
  )[0];

  if (!curriculumRow) {
    return null;
  }

  return {
    curriculumId: curriculumRow.id,
    status: curriculumRow.status as CurriculumStatus,
    speed: curriculumRow.speed as Speed,
    hinting: curriculumRow.hinting,
  };
}

export async function setCurriculumStatus(
  curriculumId: string,
  status: CurriculumStatus,
): Promise<void> {
  await getDb()
    .update(curricula)
    .set({ status })
    .where(eq(curricula.id, curriculumId));
}

export async function setCurriculumStrictOrder(
  curriculumId: string,
  strictOrder: boolean,
): Promise<void> {
  await getDb()
    .update(curricula)
    .set({ strictOrder })
    .where(eq(curricula.id, curriculumId));
}

/**
 * Bulk id-to-name lookup for read-only views that need to display a
 * curriculum's name alongside data keyed by id but don't need the full
 * `Curriculum` shape — e.g. the admin observability view's recent
 * `llm_call_events` list.
 */
export async function getCurriculumNamesByIds(
  curriculumIds: string[],
): Promise<Map<string, string>> {
  if (curriculumIds.length === 0) {
    return new Map();
  }

  const rows = await getDb()
    .select({ id: curricula.id, name: curricula.name })
    .from(curricula)
    .where(inArray(curricula.id, curriculumIds));

  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function getCurriculum(
  curriculumId: string,
): Promise<Curriculum | null> {
  const row = (
    await getDb().select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!row) {
    return null;
  }

  return toCurriculum(row, await originFor(curriculumId));
}

export interface CurriculumPromptContext {
  curriculumName: string;
  curriculumDescription: string | null;
  subjectName: string;
  subjectDescription: string | null;
  subjectKind: string;
}

export async function getCurriculumPromptContext(
  curriculumId: string,
): Promise<CurriculumPromptContext | null> {
  const db = getDb();

  const curriculumRow = (
    await db.select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!curriculumRow) {
    return null;
  }

  const subjectRow = (
    await db.select().from(subjects).where(eq(subjects.id, curriculumRow.subjectId))
  )[0];

  return {
    curriculumName: curriculumRow.name,
    curriculumDescription: curriculumRow.description ?? null,
    subjectName: subjectRow?.name ?? "",
    subjectDescription: subjectRow?.description ?? null,
    subjectKind: subjectRow?.kind ?? "architecture-mentor",
  };
}

export interface MergeTopicSnapshot {
  title: string;
  progressStatus: string;
  progressAttempts: number;
  learningStatus: string;
  selfGrade: number | null;
  included: boolean;
}

export interface MergeModuleSnapshot {
  moduleId: string;
  title: string;
  learningStatus: string;
  topics: MergeTopicSnapshot[];
}

export async function getModuleProgressSnapshots(
  curriculumId: string,
): Promise<MergeModuleSnapshot[]> {
  const db = getDb();

  const [moduleRows, topicRows] = await Promise.all([
    db.select().from(modules).where(eq(modules.curriculumId, curriculumId)),
    db.select().from(topics).where(eq(topics.curriculumId, curriculumId)),
  ]);

  return moduleRows.map((m) => ({
    moduleId: m.id,
    title: m.title,
    learningStatus: m.learningStatus,
    topics: topicRows
      .filter((t) => t.moduleId === m.id)
      .map((t) => ({
        title: t.title,
        progressStatus: t.progressStatus,
        progressAttempts: t.progressAttempts,
        learningStatus: t.learningStatus,
        selfGrade: t.selfGrade,
        included: t.included,
      })),
  }));
}

export async function deleteModules(moduleIds: string[]): Promise<void> {
  if (moduleIds.length === 0) {
    return;
  }

  const db = getDb();

  const topicRows = await db
    .select()
    .from(topics)
    .where(inArray(topics.moduleId, moduleIds));
  const topicIds = topicRows.map((t) => t.id);

  await db.transaction(async (tx) => {
    if (topicIds.length > 0) {
      const gapRows = await tx
        .select({ id: gaps.id })
        .from(gaps)
        .where(inArray(gaps.topicId, topicIds));

      await deleteGapMasteryForGapIds(gapRows.map((g) => g.id), tx);
      await tx.delete(gaps).where(inArray(gaps.topicId, topicIds));
    }

    await tx.delete(topics).where(inArray(topics.moduleId, moduleIds));
    await tx.delete(modules).where(inArray(modules.id, moduleIds));
  });
}

export interface SourceRow {
  id: string;
  kind: string;
  value: string;
  title: string | null;
  fetchedText: string | null;
}

export async function getCurriculumSourceRows(
  curriculumId: string,
): Promise<SourceRow[]> {
  const rows = await getDb()
    .select()
    .from(sources)
    .where(eq(sources.curriculumId, curriculumId));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    value: r.value,
    title: r.title,
    fetchedText: r.fetchedText,
  }));
}

export async function storeFetchedText(
  sourceId: string,
  text: string,
): Promise<void> {
  await getDb()
    .update(sources)
    .set({ fetchedText: text })
    .where(eq(sources.id, sourceId));
}

export async function getCurriculumGroundingText(
  curriculumId: string,
): Promise<string> {
  const rows = await getCurriculumSourceRows(curriculumId);

  return rows
    .map((r) => r.fetchedText ?? (r.kind === "text" ? r.value : ""))
    .filter((t) => t.trim().length > 0)
    .join("\n\n---\n\n");
}

const FETCHED_TEXT_URL_KINDS = new Set(["llms_txt", "link", "text"]);

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getCurriculumCitableUrls(
  curriculumId: string,
): Promise<string[]> {
  const rows = await getCurriculumSourceRows(curriculumId);
  const urls = new Set<string>();

  for (const row of rows) {
    if (isAbsoluteHttpUrl(row.value)) {
      urls.add(row.value);
    }

    if (row.fetchedText && FETCHED_TEXT_URL_KINDS.has(row.kind)) {
      for (const url of extractUrls(row.fetchedText)) {
        urls.add(url);
      }
    }
  }

  return Array.from(urls);
}

export async function addCurriculumSources(
  curriculumId: string,
  drafts: SourceDraft[],
): Promise<void> {
  if (drafts.length === 0) {
    return;
  }

  await getDb()
    .insert(sources)
    .values(
      drafts.map((s) => ({
        id: newId("src"),
        curriculumId,
        kind: s.kind,
        value: s.value,
        title: s.title ?? null,
      })),
    );
}

export type ClearStructureScope = "own" | "all";

/**
 * Which module/topic rows a clear at the given scope would remove.
 *
 * At scope "all" that is simply everything under the curriculum — what an
 * explicit `deleteCurriculum` needs, since leaving merged-in rows behind
 * would orphan them under a curriculum id that no longer exists.
 *
 * At scope "own" (the default, used by the "Retry research"/"Reparse"
 * recovery path) a row survives when its own `mergedFromCurriculumId` is
 * set, and a module additionally survives when it still holds a merged-in
 * topic — `updateTopic` can reparent a topic across modules, so provenance
 * derived from the parent module alone would drop it. Topics under a
 * surviving module survive with it, which is what keeps a topic the learner
 * added under a merged-in module after the merge. A topic whose module is
 * already gone still gets cleared, matching the delete-by-curriculum_id
 * sweep this replaces.
 */
async function resolveClearTargets(
  curriculumId: string,
  scope: ClearStructureScope,
  db: DbExecutor,
): Promise<{ moduleIds: string[]; topicIds: string[] }> {
  const moduleRows = await db
    .select({ id: modules.id, mergedFrom: modules.mergedFromCurriculumId })
    .from(modules)
    .where(eq(modules.curriculumId, curriculumId));
  const topicRows = await db
    .select({
      id: topics.id,
      moduleId: topics.moduleId,
      mergedFrom: topics.mergedFromCurriculumId,
    })
    .from(topics)
    .where(eq(topics.curriculumId, curriculumId));

  if (scope === "all") {
    return { moduleIds: moduleRows.map((m) => m.id), topicIds: topicRows.map((t) => t.id) };
  }

  const survivingModuleIds = new Set(
    moduleRows.filter((m) => m.mergedFrom !== null).map((m) => m.id),
  );

  for (const topic of topicRows) {
    if (topic.mergedFrom !== null) {
      survivingModuleIds.add(topic.moduleId);
    }
  }

  return {
    moduleIds: moduleRows.filter((m) => !survivingModuleIds.has(m.id)).map((m) => m.id),
    topicIds: topicRows
      .filter((t) => t.mergedFrom === null && !survivingModuleIds.has(t.moduleId))
      .map((t) => t.id),
  };
}

export async function clearCurriculumStructure(
  curriculumId: string,
  scope: ClearStructureScope = "own",
  db: DbExecutor = getDb(),
): Promise<void> {
  const { moduleIds, topicIds } = await resolveClearTargets(curriculumId, scope, db);

  if (moduleIds.length === 0 && topicIds.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    if (topicIds.length > 0) {
      const gapRows = await tx
        .select({ id: gaps.id })
        .from(gaps)
        .where(inArray(gaps.topicId, topicIds));

      await deleteGapMasteryForGapIds(gapRows.map((g) => g.id), tx);
      await tx.delete(gaps).where(inArray(gaps.topicId, topicIds));
      await tx.delete(topics).where(inArray(topics.id, topicIds));
    }

    if (moduleIds.length > 0) {
      await tx.delete(modules).where(inArray(modules.id, moduleIds));
    }
  });
}

export async function maxModuleOrder(curriculumId: string): Promise<number> {
  const row = (
    await getDb()
      .select({ maxOrder: sql<number>`coalesce(max(${modules.order}), 0)` })
      .from(modules)
      .where(eq(modules.curriculumId, curriculumId))
  )[0];

  return row?.maxOrder ?? 0;
}

// `db` defaults to getDb() so the DELETE /curricula/:id controller and every
// test call site are unaffected. It exists so `deleteSubject` — which runs its
// whole body inside `withSubjectLock`'s transaction, holding one pooled
// connection — can hand that transaction down instead of this loop taking a
// SECOND connection from a `max: 4` pool per owned curriculum
// (docs/architecture/concurrency-and-verification-hardening/review.md). It
// also makes the curricula deletions part of the caller's transaction, so a
// failure partway through no longer leaves a subject whose courses are gone.
export async function deleteCurriculum(
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const existing = (
    await db.select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!existing) {
    return false;
  }

  await clearCurriculumStructure(curriculumId, "all", db);
  await db.delete(sources).where(eq(sources.curriculumId, curriculumId));
  await db.delete(curricula).where(eq(curricula.id, curriculumId));

  return true;
}

export type MergeCurriculaError =
  | "self_merge"
  | "not_found"
  | "different_subjects"
  | "pending_structure_turn"
  | "target_failed";

/**
 * Absorbs `sourceId` into `targetId`: every module/topic/source/
 * socratic_sessions/probe_sessions row owned by the source moves to the
 * target (modules land as ADDITIONAL modules under the target, no
 * title-matching reconciliation attempted — see spec.md's Decision #1 —
 * with their `order` offset past the target's current max so the two
 * independently-numbered sequences don't collide/interleave under
 * `sortForDisplay`), the source's `curriculum_structure_turns` and
 * `structure_research_candidates` rows are DELETED rather than reassigned
 * (Decision #2 — reassigning risks colliding with
 * `curriculum_structure_turns_pending_assistant_unique` and always produces
 * an incoherent interleaved chat thread), `llm_call_events` is left
 * pointing at the deleted source id on purpose (Decision #3 — an
 * append-only observability log, reassigning would falsify which
 * curriculum an LLM call actually ran against), and the source `curricula`
 * row is deleted directly (not via `deleteCurriculum()`, which would
 * re-clear structure this merge already moved off the source — same
 * reasoning `mergeSubjects` already established for bypassing
 * `deleteSubject()`).
 *
 * The SOURCE must not have a `curriculum_structure_turns` row still
 * `role: 'assistant', status: 'pending'` — scoped to the source only, never
 * the target, since the target's own turns are never touched by this merge
 * (Decision #2's verified reasoning).
 *
 * The TARGET must not be `status: 'failed'`. Found by `/debrief`
 * (docs/architecture/curriculum-merge/review.md): a failed curriculum's
 * "Retry research"/"Reparse" recovery action calls
 * `clearCurriculumStructure()`, which deletes every module/topic currently
 * under that curriculum id with no concept of how they got there — merged-in
 * content from another curriculum is deleted right alongside the original
 * content that actually failed. This is not a timing race (a lock cannot
 * close it, since the merge and the retry can be arbitrarily far apart in
 * time); it's a real, ordinarily-reachable data-loss path, since the
 * merge-target picker previously showed no status signal at all. Refusing a
 * failed target here closes the "picked an unlabeled failed curriculum by
 * accident" entry point. The harder case — a healthy merge target that fails
 * LATER through ordinary use (e.g. `mergeSourcesIntoCurriculum` failing on a
 * subsequent "add more sources" attempt) — is closed by the
 * `mergedFromCurriculumId` marker this reassignment writes onto every moved
 * module and topic: `clearCurriculumStructure` then spares those rows.
 */
export async function mergeCurricula(
  targetId: string,
  sourceId: string,
): Promise<MergeCurriculaResult | { error: MergeCurriculaError }> {
  return withMergeLock(targetId, sourceId, async (tx) => {
    const targetRow = (
      await tx.select().from(curricula).where(eq(curricula.id, targetId))
    )[0];
    const sourceRow = (
      await tx.select().from(curricula).where(eq(curricula.id, sourceId))
    )[0];

    if (!targetRow || !sourceRow) {
      return { error: "not_found" as const };
    }

    if (targetRow.subjectId !== sourceRow.subjectId) {
      return { error: "different_subjects" as const };
    }

    if (targetRow.status === "failed") {
      return { error: "target_failed" as const };
    }

    const pendingSourceTurn = (
      await tx
        .select({ id: curriculumStructureTurns.id })
        .from(curriculumStructureTurns)
        .where(
          and(
            eq(curriculumStructureTurns.curriculumId, sourceId),
            eq(curriculumStructureTurns.role, "assistant"),
            eq(curriculumStructureTurns.status, "pending"),
          ),
        )
    )[0];

    if (pendingSourceTurn) {
      return { error: "pending_structure_turn" as const };
    }

    const targetMaxOrderRow = (
      await tx
        .select({ maxOrder: sql<number>`coalesce(max(${modules.order}), 0)` })
        .from(modules)
        .where(eq(modules.curriculumId, targetId))
    )[0];
    const targetMaxOrder = targetMaxOrderRow?.maxOrder ?? 0;

    // `coalesce` rather than a straight assignment so a chain of merges
    // keeps naming the curriculum a row ORIGINALLY came from: content that
    // reached B via an earlier merge and is now moving on to A stays
    // attributed to its first origin. Either way the marker is non-NULL,
    // which is what `clearCurriculumStructure` filters on.
    const movedModules = await tx
      .update(modules)
      .set({
        curriculumId: targetId,
        order: sql`${modules.order} + ${targetMaxOrder}`,
        mergedFromCurriculumId: sql`coalesce(${modules.mergedFromCurriculumId}, ${sourceId})`,
      })
      .where(eq(modules.curriculumId, sourceId))
      .returning({ id: modules.id });

    const movedTopics = await tx
      .update(topics)
      .set({
        curriculumId: targetId,
        mergedFromCurriculumId: sql`coalesce(${topics.mergedFromCurriculumId}, ${sourceId})`,
      })
      .where(eq(topics.curriculumId, sourceId))
      .returning({ id: topics.id });

    const movedSources = await tx
      .update(sources)
      .set({ curriculumId: targetId })
      .where(eq(sources.curriculumId, sourceId))
      .returning({ id: sources.id });

    const movedSocraticSessions = await tx
      .update(socraticSessions)
      .set({ curriculumId: targetId })
      .where(eq(socraticSessions.curriculumId, sourceId))
      .returning({ id: socraticSessions.id });

    const movedProbeSessions = await tx
      .update(probeSessions)
      .set({ curriculumId: targetId })
      .where(eq(probeSessions.curriculumId, sourceId))
      .returning({ id: probeSessions.id });

    await tx
      .delete(curriculumStructureTurns)
      .where(eq(curriculumStructureTurns.curriculumId, sourceId));
    await tx
      .delete(structureResearchCandidates)
      .where(eq(structureResearchCandidates.curriculumId, sourceId));

    await tx.delete(curricula).where(eq(curricula.id, sourceId));

    await insertOntologyMergeLog(
      {
        entityType: "curriculum",
        targetId,
        targetName: targetRow.name,
        sourceId,
        sourceName: sourceRow.name,
        reassignedCounts: {
          modulesMoved: movedModules.length,
          topicsMoved: movedTopics.length,
          sourcesMoved: movedSources.length,
          socraticSessionsMoved: movedSocraticSessions.length,
          probeSessionsMoved: movedProbeSessions.length,
        },
      },
      tx,
    );

    return {
      targetCurriculumId: targetId,
      sourceCurriculumId: sourceId,
      modulesMoved: movedModules.length,
      topicsMoved: movedTopics.length,
      sourcesMoved: movedSources.length,
      socraticSessionsMoved: movedSocraticSessions.length,
      probeSessionsMoved: movedProbeSessions.length,
    };
  });
}

export async function countModules(curriculumId: string): Promise<number> {
  const rows = await getDb()
    .select()
    .from(modules)
    .where(eq(modules.curriculumId, curriculumId));

  return rows.length;
}

export async function confirmCurriculum(
  curriculumId: string,
): Promise<Curriculum | "not_found" | "not_ready" | "not_studyable"> {
  const db = getDb();

  const existing = (
    await db.select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!existing) {
    return "not_found";
  }

  if (existing.status === "confirmed") {
    return toCurriculum(existing, await originFor(curriculumId));
  }

  if (existing.status !== "ready") {
    return "not_ready";
  }

  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.curriculumId, curriculumId));
  const topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.curriculumId, curriculumId));

  const studyable = hasStudyableContent(
    moduleRows.map((m) => ({
      topics: topicRows
        .filter((t) => t.moduleId === m.id)
        .map((t) => ({ included: t.included })),
    })),
  );

  if (!studyable) {
    return "not_studyable";
  }

  const rows = await db
    .update(curricula)
    .set({ status: "confirmed" })
    .where(eq(curricula.id, curriculumId))
    .returning();

  return toCurriculum(rows[0]!, await originFor(curriculumId));
}

export async function markPreAssessmentCompleted(
  curriculumId: string,
): Promise<Curriculum | "not_found"> {
  const db = getDb();

  const rows = await db
    .update(curricula)
    .set({ preAssessmentCompletedAt: new Date() })
    .where(eq(curricula.id, curriculumId))
    .returning();

  if (!rows[0]) {
    return "not_found";
  }

  return toCurriculum(rows[0], await originFor(curriculumId));
}


export async function updateCurriculum(
  input: UpdateCurriculumInput,
): Promise<Curriculum | null> {
  const db = getDb();

  const patch: Partial<typeof curricula.$inferInsert> = {};

  if (input.learningStatus !== undefined) {
    patch.learningStatus = input.learningStatus;
  }

  if (input.speed !== undefined) {
    patch.speed = input.speed;
  }

  if (input.hinting !== undefined) {
    patch.hinting = input.hinting;
  }

  if (input.defaultDepth !== undefined) {
    patch.defaultDepth = input.defaultDepth;
  }

  if (input.strictOrder !== undefined) {
    patch.strictOrder = input.strictOrder;
  }

  if (input.domainNodeId !== undefined) {
    patch.domainNodeId = input.domainNodeId;
  }

  if (Object.keys(patch).length === 0) {
    const existing = (
      await db.select().from(curricula).where(eq(curricula.id, input.curriculumId))
    )[0];

    return existing ? toCurriculum(existing, await originFor(input.curriculumId)) : null;
  }

  const rows = await db
    .update(curricula)
    .set(patch)
    .where(eq(curricula.id, input.curriculumId))
    .returning();

  const row = rows[0];

  return row ? toCurriculum(row, await originFor(input.curriculumId)) : null;
}

export async function saveCurriculumPlan(
  curriculumId: string,
  plan: CurriculumPlan | Plan,
  orderOffset = 0,
  options?: { defaultIncluded?: boolean; preferredLevel?: Level | null },
): Promise<void> {
  const db = getDb();
  const defaultIncluded = options?.defaultIncluded ?? true;
  const preferredLevel = options?.preferredLevel ?? null;

  for (const [moduleIndex, mod] of plan.modules.entries()) {
    const moduleId = newId("mod");
    const moduleLevel = (mod as PlanModule).level ?? null;

    await db.insert(modules).values({
      id: moduleId,
      curriculumId,
      title: mod.title,
      order: orderOffset + moduleIndex + 1,
      level: moduleLevel,
    });

    const proposedTags = (mod as PlanModule).tags ?? [];

    for (const tagName of proposedTags) {
      if (!tagName.trim()) {
        continue;
      }

      const tag = await resolveOrCreateTag(tagName);

      await assignTag(tag.id, "module", moduleId);
    }

    const included = preferredLevel
      ? shouldIncludeTopicByDefault(moduleLevel, preferredLevel)
      : defaultIncluded;

    for (const [topicIndex, top] of mod.topics.entries()) {
      await db.insert(topics).values({
        id: newId("top"),
        moduleId,
        curriculumId,
        title: top.title,
        summary: top.summary ?? null,
        order: topicIndex + 1,
        depth: top.suggestedDepth,
        included,
      });
    }
  }
}

export interface ResearchSourceInput {
  kind: "web_research" | "llms_txt";
  value: string;
  title: string;
}

export async function insertResearchSource(
  curriculumId: string,
  source: ResearchSourceInput,
  groundingText: string,
): Promise<void> {
  await getDb()
    .insert(sources)
    .values({
      id: newId("src"),
      curriculumId,
      kind: source.kind,
      value: source.value,
      title: source.title,
      fetchedText: groundingText,
    });
}

/**
 * The pasted-material entry point (Phase 5, SCENARIO: "paste what you
 * already have"): stored immediately as an approved `text`-kind source, the
 * same way a hand-authored source row already works — no candidate-
 * gathering/approval round for material the learner already brought in
 * themselves.
 */
export async function insertApprovedTextSource(
  curriculumId: string,
  text: string,
): Promise<void> {
  await getDb()
    .insert(sources)
    .values({
      id: newId("src"),
      curriculumId,
      kind: "text",
      value: text,
      title: "Pasted material",
      fetchedText: text,
      approvalStatus: "approved",
    });
}

/**
 * Wipes every source row (candidates, manually-added links, and the
 * origin-tracking marker alike) for a curriculum — used when retrying
 * research from scratch, since the whole sources table for a
 * research-triggered curriculum is candidate-gathering machinery, not
 * user-pasted material (that path is `parseCurriculum`, untouched here).
 */
export async function deleteAllCurriculumSources(curriculumId: string): Promise<void> {
  await getDb().delete(sources).where(eq(sources.curriculumId, curriculumId));
}

export interface PendingSourceDraft {
  kind: string;
  url: string;
  title: string;
  fetchedText: string | null;
}

export async function insertPendingSources(
  curriculumId: string,
  drafts: PendingSourceDraft[],
): Promise<void> {
  if (drafts.length === 0) {
    return;
  }

  await getDb()
    .insert(sources)
    .values(
      drafts.map((d) => ({
        id: newId("src"),
        curriculumId,
        kind: d.kind,
        value: d.url,
        title: d.title,
        fetchedText: d.fetchedText,
        approvalStatus: "pending",
      })),
    );
}

/**
 * A curriculum's real, reviewable candidate/approved sources — excludes the
 * `web_research`-kind origin-tracking marker row that `insertResearchSource`
 * always inserts for a research-triggered curriculum, which is never a
 * candidate for the learner to approve or reject.
 */
export async function getApprovableSourceCount(curriculumId: string): Promise<number> {
  const rows = await getDb()
    .select()
    .from(sources)
    .where(eq(sources.curriculumId, curriculumId));

  return rows.filter((r) => r.kind !== "web_research").length;
}

export async function approveAllPendingSources(curriculumId: string): Promise<void> {
  await getDb()
    .update(sources)
    .set({ approvalStatus: "approved" })
    .where(and(eq(sources.curriculumId, curriculumId), eq(sources.approvalStatus, "pending")));
}

export async function deleteSource(sourceId: string): Promise<boolean> {
  const db = getDb();

  const existing = (await db.select().from(sources).where(eq(sources.id, sourceId)))[0];

  if (!existing) {
    return false;
  }

  await db.delete(sources).where(eq(sources.id, sourceId));

  return true;
}

export interface StructureTurnDraft {
  role: StructureTurnRole;
  message: string;
  structureSnapshot: DocResearchPlan | null;
  splitSuggestion?: SplitSuggestion | null;
  toolActions?: string[];
  status?: StructureTurnStatus;
}

/**
 * Appends one turn to a curriculum's structure-shaping chat (Phase 5).
 * `order` is a monotonic sequence column, not `createdAt` — two turns
 * inserted within the same `submitStructureTurn` call (the user's message,
 * then the regenerated assistant reply) can otherwise land on the exact
 * same millisecond and render out of order. Returns the new row's id so a
 * caller that inserted a "pending" placeholder can later finalize the SAME
 * row via `updateStructureTurn` rather than appending a second one.
 */
export async function insertStructureTurn(
  curriculumId: string,
  draft: StructureTurnDraft,
): Promise<string> {
  const db = getDb();

  const existing = await db
    .select()
    .from(curriculumStructureTurns)
    .where(eq(curriculumStructureTurns.curriculumId, curriculumId));

  const nextOrder = existing.reduce((max, row) => Math.max(max, row.order), 0) + 1;
  const id = newId("turn");

  await db.insert(curriculumStructureTurns).values({
    id,
    curriculumId,
    role: draft.role,
    message: draft.message,
    structureSnapshot: draft.structureSnapshot,
    splitSuggestion: draft.splitSuggestion ?? null,
    toolActions: draft.toolActions ?? [],
    status: draft.status ?? "complete",
    order: nextOrder,
  });

  return id;
}

export interface StructureTurnUpdate {
  message?: string;
  structureSnapshot?: DocResearchPlan | null;
  splitSuggestion?: SplitSuggestion | null;
  toolActions?: string[];
  status: StructureTurnStatus;
}

/**
 * Finalizes a turn written earlier as a "pending" placeholder (see
 * `insertStructureTurn`) in place — used once the agent call it was
 * waiting on resolves, either into a real result or into the existing
 * fallback failure message. Never inserts a second row for the same turn.
 */
export async function updateStructureTurn(
  turnId: string,
  patch: StructureTurnUpdate,
): Promise<void> {
  const values: Partial<typeof curriculumStructureTurns.$inferInsert> = {
    status: patch.status,
  };

  if (patch.message !== undefined) {
    values.message = patch.message;
  }

  if (patch.structureSnapshot !== undefined) {
    values.structureSnapshot = patch.structureSnapshot;
  }

  if (patch.splitSuggestion !== undefined) {
    values.splitSuggestion = patch.splitSuggestion;
  }

  if (patch.toolActions !== undefined) {
    values.toolActions = patch.toolActions;
  }

  await getDb()
    .update(curriculumStructureTurns)
    .set(values)
    .where(eq(curriculumStructureTurns.id, turnId));
}

/**
 * Whether Phase 5's draft-generation stage was ever reached for this
 * curriculum — `generateDraftStructure` always writes a placeholder turn
 * before calling the agent (see that function), so this stays accurate
 * even for a curriculum whose very first draft attempt failed outright.
 * Used to tell a Phase 5 draft-generation failure apart from an old
 * pre-Phase-5 research/parse failure, which never writes to this table at
 * all — see `FailedBanner` on the frontend.
 */
export async function hasAnyStructureTurns(curriculumId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: curriculumStructureTurns.id })
    .from(curriculumStructureTurns)
    .where(eq(curriculumStructureTurns.curriculumId, curriculumId))
    .limit(1);

  return rows.length > 0;
}

/**
 * The one DB side effect any structure-editor tool is allowed beyond the
 * current curriculum's own snapshot: `splitModuleIntoNewCourse` creates a
 * brand-new, additive-only `curricula` row seeded directly at
 * "shaping_structure" (no candidate-gathering or draft-generation LLM call
 * needed — the split-out module's content already exists).
 */
export async function createSplitOutCurriculum(
  subjectId: string,
  name: string,
): Promise<Curriculum> {
  const row = {
    id: newId("cur"),
    subjectId,
    name,
    description: null,
    status: "shaping_structure" as const,
    learningStatus: "not_started" as const,
    speed: "normal" as const,
    hinting: true,
    defaultDepth: "working" as const,
    strictOrder: false,
    preAssessmentCompletedAt: null,
    domainNodeId: null,
  };

  await getDb().insert(curricula).values(row);

  return toCurriculum(row, "sources");
}

export async function getStructureTurns(curriculumId: string): Promise<StructureTurn[]> {
  const db = getDb();

  const [rows, candidateRows] = await Promise.all([
    db
      .select()
      .from(curriculumStructureTurns)
      .where(eq(curriculumStructureTurns.curriculumId, curriculumId))
      .orderBy(asc(curriculumStructureTurns.order)),
    db
      .select()
      .from(structureResearchCandidates)
      .where(
        and(
          eq(structureResearchCandidates.curriculumId, curriculumId),
          eq(structureResearchCandidates.approvalStatus, "pending"),
        ),
      ),
  ]);

  const pendingByTurnId = new Map<string, StructureResearchCandidate[]>();

  for (const row of candidateRows) {
    if (!row.structureTurnId) {
      continue;
    }

    const list = pendingByTurnId.get(row.structureTurnId) ?? [];

    list.push(toResearchCandidate(row));
    pendingByTurnId.set(row.structureTurnId, list);
  }

  return rows.map((row) => toStructureTurn(row, pendingByTurnId.get(row.id) ?? []));
}

/**
 * Persists one batch of SUPPLEMENTAL (research-gap-triggered) trusted-source
 * candidates against the assistant turn that surfaced them — held here for
 * explicit learner approval before `resolveSupplementalResearch` ever hands
 * them to the structure-editor agent. `label` is the joined gap-label string
 * for the whole batch (the underlying `gatherTrustedSourceCandidates` call
 * runs once across every flagged label together, so per-candidate
 * attribution to a single label isn't recoverable from its result).
 */
export async function insertStructureResearchCandidates(
  curriculumId: string,
  structureTurnId: string,
  label: string,
  candidates: { url: string; title: string }[],
): Promise<void> {
  if (candidates.length === 0) {
    return;
  }

  await getDb()
    .insert(structureResearchCandidates)
    .values(
      candidates.map((c) => ({
        id: newId("resc"),
        curriculumId,
        structureTurnId,
        label,
        title: c.title,
        value: c.url,
      })),
    );
}

/**
 * The most recently surfaced batch of still-`pending` supplemental research
 * candidates for a curriculum — identified by whichever `structureTurnId`
 * owns the freshest pending row, since batches from an earlier, un-resolved
 * research request (the learner ignored it and kept chatting) may still
 * have rows sitting at `pending` alongside a newer batch. Used by
 * `resolveSupplementalResearch`, which is never told a turn id explicitly.
 */
export async function getLatestPendingResearchCandidates(
  curriculumId: string,
): Promise<StructureResearchCandidate[]> {
  const rows = await getDb()
    .select()
    .from(structureResearchCandidates)
    .where(
      and(
        eq(structureResearchCandidates.curriculumId, curriculumId),
        eq(structureResearchCandidates.approvalStatus, "pending"),
      ),
    );

  if (rows.length === 0) {
    return [];
  }

  const latest = rows.reduce((latest, row) =>
    row.createdAt > latest.createdAt ? row : latest,
  );

  return rows
    .filter((row) => row.structureTurnId === latest.structureTurnId)
    .map(toResearchCandidate);
}

/**
 * Finalizes a batch of supplemental research candidates once the learner
 * resolves them (`resolveSupplementalResearch`) — approved ones feed the
 * structure-editor prompt as `supplementalSources`, rejected ones are kept
 * (not deleted) purely as the conversation's own audit trail.
 */
export async function setResearchCandidateStatuses(
  candidateIds: string[],
  approvalStatus: ResearchCandidateApprovalStatus,
): Promise<void> {
  if (candidateIds.length === 0) {
    return;
  }

  await getDb()
    .update(structureResearchCandidates)
    .set({ approvalStatus })
    .where(inArray(structureResearchCandidates.id, candidateIds));
}

function toResearchCandidate(
  row: typeof structureResearchCandidates.$inferSelect,
): StructureResearchCandidate {
  return {
    id: row.id,
    label: row.label,
    title: row.title,
    value: row.value,
    approvalStatus: row.approvalStatus as ResearchCandidateApprovalStatus,
  };
}

/**
 * The most recent assistant turn's snapshot — the "current draft" every
 * regeneration and the confirm step both build from. Skips over the always-
 * snapshot-less user turns rather than assuming the last row is the one
 * that matters.
 */
export async function getLatestStructureSnapshot(
  curriculumId: string,
): Promise<DocResearchPlan | null> {
  const turns = await getStructureTurns(curriculumId);

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]!.structureSnapshot) {
      return turns[i]!.structureSnapshot as DocResearchPlan;
    }
  }

  return null;
}

function toStructureTurn(
  row: typeof curriculumStructureTurns.$inferSelect,
  pendingResearchCandidates: StructureResearchCandidate[] = [],
): StructureTurn {
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    role: row.role as StructureTurnRole,
    message: row.message,
    structureSnapshot: (row.structureSnapshot as DocResearchPlan | null) ?? null,
    splitSuggestion: (row.splitSuggestion as SplitSuggestion | null) ?? null,
    toolActions: (row.toolActions as string[] | null) ?? [],
    status: row.status as StructureTurnStatus,
    pendingResearchCandidates,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getCurriculumDetail(
  curriculumId: string,
): Promise<CurriculumDetail | null> {
  const db = getDb();

  const curriculumRow = (
    await db.select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!curriculumRow) {
    return null;
  }

  const [sourceRows, moduleRows, topicRows] = await Promise.all([
    db.select().from(sources).where(eq(sources.curriculumId, curriculumId)),
    db.select().from(modules).where(eq(modules.curriculumId, curriculumId)),
    db.select().from(topics).where(eq(topics.curriculumId, curriculumId)),
  ]);

  const gapRows =
    topicRows.length > 0
      ? await db.select().from(gaps).where(
          inArray(gaps.topicId, topicRows.map((t) => t.id)),
        )
      : [];

  // Generalized recall-gap mastery tracking (issue #57) — display
  // precedence (spec.md Decision 2 addendum): this curriculum-detail
  // hydration path has its own gap fetch, independent of gap.repo.ts's
  // listGapsForTopic, so the gap_mastery join has to happen here too or a
  // mastery-tracked gap would silently render its legacy open/covered flag
  // on this page while showing correctly wherever listGapsForTopic is used.
  const masteryRows =
    gapRows.length > 0
      ? await db
          .select()
          .from(gapMastery)
          .where(inArray(gapMastery.gapId, gapRows.map((g) => g.id)))
      : [];
  const masteryByGapId = new Map(masteryRows.map((m) => [m.gapId, m]));

  const tagsByNode = await loadTagsByNode([
    ...moduleRows.map((m) => m.id),
    ...topicRows.map((t) => t.id),
  ]);

  const assembledModules = buildModules(
    moduleRows,
    topicRows,
    gapRows,
    curriculumRow.strictOrder,
    tagsByNode,
    masteryByGapId,
  );

  const [citableUrls, hasStructureDraftAttempt] = await Promise.all([
    getCurriculumCitableUrls(curriculumId),
    hasAnyStructureTurns(curriculumId),
  ]);

  return {
    curriculum: toCurriculum(
      curriculumRow,
      resolveCurriculumOrigin(sourceRows.map((s) => s.kind)),
    ),
    sources: sourceRows.map(toSource),
    modules: assembledModules,
    progress: curriculumProgress(assembledModules),
    recommendedTopicId: recommendedTopicId(assembledModules),
    hasCitableSources: citableUrls.length > 0,
    hasStructureDraftAttempt,
  };
}

export async function getLearningMapSnapshots(): Promise<LearningMapSnapshot[]> {
  const db = getDb();

  const curriculumRows = await db
    .select()
    .from(curricula)
    .where(eq(curricula.status, "confirmed"));

  if (curriculumRows.length === 0) {
    return [];
  }

  const curriculumIds = curriculumRows.map((c) => c.id);
  const subjectIds = Array.from(new Set(curriculumRows.map((c) => c.subjectId)));

  const [subjectRows, moduleRows, topicRows] = await Promise.all([
    db.select().from(subjects).where(inArray(subjects.id, subjectIds)),
    db.select().from(modules).where(inArray(modules.curriculumId, curriculumIds)),
    db.select().from(topics).where(inArray(topics.curriculumId, curriculumIds)),
  ]);

  const subjectNameById = new Map(subjectRows.map((s) => [s.id, s.name]));

  return curriculumRows.map((c) => {
    const curriculumModules = moduleRows.filter((m) => m.curriculumId === c.id);
    const curriculumTopics = topicRows
      .filter((t) => t.curriculumId === c.id)
      .map((t) => toTopic(t));

    const topicsByModuleId = new Map<string, Topic[]>();

    for (const t of curriculumTopics) {
      const list = topicsByModuleId.get(t.moduleId) ?? [];
      list.push(t);
      topicsByModuleId.set(t.moduleId, list);
    }

    const moduleSnapshots: LearningMapModuleSnapshot[] = curriculumModules.map((m) => {
      const moduleTopics = topicsByModuleId.get(m.id) ?? [];

      return {
        level: (m.level as Level | null) ?? null,
        progress: moduleProgress(moduleTopics),
        topics: moduleTopics.map((t) => ({
          id: t.id,
          title: t.title,
          progress: t.progress,
        })),
      };
    });

    const overallProgress = moduleProgress(curriculumTopics);
    const lastInteractedAt = curriculumTopics.reduce<string | null>((latest, t) => {
      if (!t.progress.lastInteractedAt) {
        return latest;
      }

      return !latest || t.progress.lastInteractedAt > latest
        ? t.progress.lastInteractedAt
        : latest;
    }, null);

    return {
      curriculumId: c.id,
      curriculumName: c.name,
      subjectName: subjectNameById.get(c.subjectId) ?? "",
      learningStatus: c.learningStatus as LearningStatus,
      percent: overallProgress.percent,
      lastInteractedAt,
      modules: moduleSnapshots,
    };
  });
}

export async function getLowerLevelCoverage(topicId: string): Promise<string[]> {
  const db = getDb();

  const topicRow = (
    await db.select().from(topics).where(eq(topics.id, topicId))
  )[0];

  if (!topicRow) {
    return [];
  }

  const moduleRow = (
    await db.select().from(modules).where(eq(modules.id, topicRow.moduleId))
  )[0];
  const currentLevel = (moduleRow?.level as Level | null) ?? null;

  if (currentLevel === null) {
    return [];
  }

  const rows = await db
    .select({ level: modules.level, label: gaps.label })
    .from(gaps)
    .innerJoin(topics, eq(gaps.topicId, topics.id))
    .innerJoin(modules, eq(topics.moduleId, modules.id))
    .where(
      and(
        eq(modules.curriculumId, topicRow.curriculumId),
        eq(gaps.state, "covered"),
      ),
    );

  const coverageByLevel = new Map<string, string[]>();

  for (const row of rows) {
    if (!row.level) {
      continue;
    }

    const list = coverageByLevel.get(row.level) ?? [];
    list.push(row.label);
    coverageByLevel.set(row.level, list);
  }

  const moduleCoverages = Array.from(coverageByLevel.entries()).map(
    ([level, coveredLabels]) => ({ level: level as Level, coveredLabels }),
  );

  return priorLevelCoverageLabels(currentLevel, moduleCoverages);
}

function buildModules(
  moduleRows: (typeof modules.$inferSelect)[],
  topicRows: (typeof topics.$inferSelect)[],
  gapRows: (typeof gaps.$inferSelect)[],
  strictOrder: boolean,
  tagsByNode: Map<string, TagChip[]> = new Map(),
  masteryByGapId: Map<string, typeof gapMastery.$inferSelect> = new Map(),
): Module[] {
  return sortForDisplay(moduleRows, strictOrder).map((m) => {
    const moduleTopics = sortForDisplay(
      topicRows.filter((t) => t.moduleId === m.id),
      strictOrder,
    ).map((t) => ({
      ...toTopic(t, tagsByNode.get(`topic:${t.id}`) ?? []),
      gaps: gapRows
        .filter((g) => g.topicId === t.id)
        .map((g) => rowToGap(g, masteryByGapId.get(g.id))),
    }));

    return {
      id: m.id,
      curriculumId: m.curriculumId,
      title: m.title,
      order: m.order,
      priority: m.priority as Module["priority"],
      learningStatus: m.learningStatus as LearningStatus,
      level: (m.level as Level | null) ?? null,
      topics: moduleTopics,
      progress: moduleProgress(moduleTopics),
      tags: tagsByNode.get(`module:${m.id}`) ?? [],
    };
  });
}

function toCurriculum(
  row: {
    id: string;
    subjectId: string;
    name: string;
    description: string | null;
    status: string;
    learningStatus: string;
    speed: string;
    hinting: boolean;
    defaultDepth: string;
    strictOrder: boolean;
    preAssessmentCompletedAt: Date | null;
    domainNodeId?: string | null;
  },
  origin: CurriculumOrigin,
): Curriculum {
  return {
    id: row.id,
    subjectId: row.subjectId,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as CurriculumStatus,
    learningStatus: row.learningStatus as LearningStatus,
    speed: row.speed as Speed,
    hinting: row.hinting,
    defaultDepth: row.defaultDepth as DepthLevel,
    origin,
    strictOrder: row.strictOrder,
    preAssessmentCompletedAt: row.preAssessmentCompletedAt
      ? row.preAssessmentCompletedAt.toISOString()
      : null,
    domainNodeId: row.domainNodeId ?? null,
  };
}

function toSource(row: typeof sources.$inferSelect): Source {
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    kind: row.kind as Source["kind"],
    value: row.value,
    title: row.title ?? undefined,
    approvalStatus: row.approvalStatus as Source["approvalStatus"],
  };
}

function toTopic(row: typeof topics.$inferSelect, tags: TagChip[] = []): Topic {
  return {
    id: row.id,
    moduleId: row.moduleId,
    title: row.title,
    summary: row.summary ?? undefined,
    order: row.order,
    priority: row.priority as Topic["priority"],
    included: row.included,
    selfGrade: (row.selfGrade as Topic["selfGrade"]) ?? null,
    depth: row.depth as DepthLevel,
    learningStatus: row.learningStatus as LearningStatus,
    questions: [],
    progress: {
      status: row.progressStatus as TopicProgressStatus,
      maturity: row.progressMaturity,
      attempts: row.progressAttempts,
      lastInteractedAt: row.progressLastInteractedAt
        ? row.progressLastInteractedAt.toISOString()
        : null,
    },
    tags,
  };
}

/**
 * Loads every tag attached to a set of module/topic node ids in two batch
 * queries (assignments, then the tag rows they point at) and returns a
 * lookup keyed by `${nodeType}:${nodeId}` — used by `getCurriculumDetail` so
 * `Module.tags`/`Topic.tags` never cost an extra query per node.
 */
async function loadTagsByNode(nodeIds: string[]): Promise<Map<string, TagChip[]>> {
  const assignments = await listAssignmentsForNodes(nodeIds);

  if (assignments.length === 0) {
    return new Map();
  }

  const tagById = await getTagsByIds(assignments.map((a) => a.tagId));
  const byNode = new Map<string, TagChip[]>();

  for (const assignment of assignments) {
    const tag = tagById.get(assignment.tagId);

    if (!tag) {
      continue;
    }

    const key = `${assignment.nodeType}:${assignment.nodeId}`;
    const list = byNode.get(key) ?? [];

    list.push({ ...tag, assignmentId: assignment.id });
    byNode.set(key, list);
  }

  return byNode;
}

