import { eq, inArray } from "drizzle-orm";
import type {
  CreateCurriculumInput,
  Curriculum,
  CurriculumDetail,
  CurriculumStatus,
  DepthLevel,
  Gap,
  LearningStatus,
  Module,
  Source,
  SourceDraft,
  Speed,
  Topic,
  TopicProgressStatus,
  UpdateCurriculumInput,
} from "@post-anki/shared";
import {
  curriculumProgress,
  moduleProgress,
  recommendedTopicId,
} from "@post-anki/core";
import { getDb } from "../db/client.js";
import {
  curricula,
  gaps,
  modules,
  sources,
  subjects,
  topics,
} from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { CurriculumPlan } from "./curriculum-plan.js";

export async function listCurricula(subjectId?: string): Promise<Curriculum[]> {
  const rows = await getDb().select().from(curricula);

  return rows
    .filter((r: typeof curricula.$inferSelect) => !subjectId || r.subjectId === subjectId)
    .map(toCurriculum);
}

export async function createCurriculum(
  input: CreateCurriculumInput,
): Promise<Curriculum> {
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
  };

  await getDb().insert(curricula).values(row);

  if (input.sources.length > 0) {
    await getDb()
      .insert(sources)
      .values(
        input.sources.map((s) => ({
          id: newId("src"),
          curriculumId: row.id,
          kind: s.kind,
          value: s.value,
          title: s.title ?? null,
        })),
      );
  }

  return toCurriculum(row);
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

export async function getCurriculum(
  curriculumId: string,
): Promise<Curriculum | null> {
  const row = (
    await getDb().select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  return row ? toCurriculum(row) : null;
}

export interface CurriculumPromptContext {
  curriculumName: string;
  curriculumDescription: string | null;
  subjectName: string;
  subjectDescription: string | null;
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

  for (const t of topicRows) {
    await db.delete(gaps).where(eq(gaps.topicId, t.id));
  }

  await db.delete(topics).where(inArray(topics.moduleId, moduleIds));
  await db.delete(modules).where(inArray(modules.id, moduleIds));
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

export async function clearCurriculumStructure(
  curriculumId: string,
): Promise<void> {
  const db = getDb();

  const topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.curriculumId, curriculumId));

  for (const t of topicRows) {
    await db.delete(gaps).where(eq(gaps.topicId, t.id));
  }

  await db.delete(topics).where(eq(topics.curriculumId, curriculumId));
  await db.delete(modules).where(eq(modules.curriculumId, curriculumId));
}

export async function deleteCurriculum(curriculumId: string): Promise<boolean> {
  const db = getDb();

  const existing = (
    await db.select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!existing) {
    return false;
  }

  await clearCurriculumStructure(curriculumId);
  await db.delete(sources).where(eq(sources.curriculumId, curriculumId));
  await db.delete(curricula).where(eq(curricula.id, curriculumId));

  return true;
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
): Promise<Curriculum | "not_found" | "not_ready"> {
  const db = getDb();

  const existing = (
    await db.select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!existing) {
    return "not_found";
  }

  if (existing.status === "confirmed") {
    return toCurriculum(existing);
  }

  if (existing.status !== "ready") {
    return "not_ready";
  }

  const rows = await db
    .update(curricula)
    .set({ status: "confirmed" })
    .where(eq(curricula.id, curriculumId))
    .returning();

  return toCurriculum(rows[0]!);
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

  if (Object.keys(patch).length === 0) {
    const existing = (
      await db.select().from(curricula).where(eq(curricula.id, input.curriculumId))
    )[0];

    return existing ? toCurriculum(existing) : null;
  }

  const rows = await db
    .update(curricula)
    .set(patch)
    .where(eq(curricula.id, input.curriculumId))
    .returning();

  const row = rows[0];

  return row ? toCurriculum(row) : null;
}

export async function saveCurriculumPlan(
  curriculumId: string,
  plan: CurriculumPlan,
  orderOffset = 0,
): Promise<void> {
  const db = getDb();

  for (const [moduleIndex, mod] of plan.modules.entries()) {
    const moduleId = newId("mod");

    await db.insert(modules).values({
      id: moduleId,
      curriculumId,
      title: mod.title,
      order: orderOffset + moduleIndex + 1,
    });

    for (const [topicIndex, top] of mod.topics.entries()) {
      await db.insert(topics).values({
        id: newId("top"),
        moduleId,
        curriculumId,
        title: top.title,
        summary: top.summary ?? null,
        order: topicIndex + 1,
        depth: top.suggestedDepth,
      });
    }
  }
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

  const assembledModules = buildModules(moduleRows, topicRows, gapRows);

  return {
    curriculum: toCurriculum(curriculumRow),
    sources: sourceRows.map(toSource),
    modules: assembledModules,
    progress: curriculumProgress(assembledModules),
    recommendedTopicId: recommendedTopicId(assembledModules),
  };
}

function buildModules(
  moduleRows: (typeof modules.$inferSelect)[],
  topicRows: (typeof topics.$inferSelect)[],
  gapRows: (typeof gaps.$inferSelect)[],
): Module[] {
  return [...moduleRows]
    .sort((a, b) => a.order - b.order)
    .map((m) => {
      const moduleTopics = topicRows
        .filter((t) => t.moduleId === m.id)
        .sort((a, b) => a.order - b.order)
        .map((t) => ({
          ...toTopic(t),
          gaps: gapRows.filter((g) => g.topicId === t.id).map(toGap),
        }));

      return {
        id: m.id,
        curriculumId: m.curriculumId,
        title: m.title,
        order: m.order,
        learningStatus: m.learningStatus as LearningStatus,
        topics: moduleTopics,
        progress: moduleProgress(moduleTopics),
      };
    });
}

function toCurriculum(row: {
  id: string;
  subjectId: string;
  name: string;
  description: string | null;
  status: string;
  learningStatus: string;
  speed: string;
  hinting: boolean;
  defaultDepth: string;
}): Curriculum {
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
  };
}

function toSource(row: typeof sources.$inferSelect): Source {
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    kind: row.kind as Source["kind"],
    value: row.value,
    title: row.title ?? undefined,
  };
}

function toTopic(row: typeof topics.$inferSelect): Topic {
  return {
    id: row.id,
    moduleId: row.moduleId,
    title: row.title,
    summary: row.summary ?? undefined,
    order: row.order,
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
  };
}

export function toGap(row: typeof gaps.$inferSelect): Gap {
  return {
    id: row.id,
    topicId: row.topicId,
    label: row.label,
    depth: row.depth as DepthLevel,
    origin: row.origin as Gap["origin"],
    state: row.state as Gap["state"],
    wanted: row.wanted,
    concern: (row.concern as Gap["concern"]) ?? null,
    lastEvaluatedAt: row.lastEvaluatedAt
      ? row.lastEvaluatedAt.toISOString()
      : null,
  };
}
