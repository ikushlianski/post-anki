import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  KNOWLEDGE_BIT_VARIANT_KIND_LABELS,
  type KnowledgeBitDetail,
  type KnowledgeBitQuestionVariantKind,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  subjects,
  tagAssignments,
  tags,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { addedBySql, sourceTypeSql } from "./knowledge-bit-browser-filters.js";
import { deriveBrowserSourceLabel } from "./knowledge-bit-browser-source-label.js";
import { deriveSubjectPath } from "./knowledge-bit-detail-subject-path.js";
import { deriveOverviewState } from "./knowledge-bit-overview-state.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";
import { ANKI_VARIANT_KIND_PREFERENCE } from "./knowledge-bit-variant-kind-rules.js";

function kindRank(kind: string): number {
  const index = (ANKI_VARIANT_KIND_PREFERENCE as readonly string[]).indexOf(kind);

  return index === -1 ? ANKI_VARIANT_KIND_PREFERENCE.length : index;
}

async function readVariants(id: string, db: DbExecutor) {
  const rows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      order: knowledgeBitQuestionVariants.order,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      sentence: knowledgeBitQuestionVariants.sentence,
      createdAt: knowledgeBitQuestionVariants.createdAt,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );

  return rows.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.order - b.order);
}

async function readTagNames(id: string, db: DbExecutor): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(tagAssignments)
    .innerJoin(tags, eq(tags.id, tagAssignments.tagId))
    .where(and(eq(tagAssignments.nodeType, "knowledgeBit"), eq(tagAssignments.nodeId, id)))
    .orderBy(asc(tags.name));

  return rows.map((row) => row.name);
}

export async function getKnowledgeBitDetail(
  id: string,
  db: DbExecutor = getDb(),
  now: Date = new Date(),
): Promise<KnowledgeBitDetail | null> {
  const [row] = await db
    .select({
      body: knowledgeBits.body,
      context: knowledgeBits.background,
      createdAt: knowledgeBits.createdAt,
      origin: sourceTypeSql,
      addedBy: addedBySql,
      subjectId: effectiveSubjectIdSql,
      sourceId: knowledgeSources.id,
      sourceUrl: knowledgeSources.sourceUrl,
      sourceText: sql<string | null>`left(${knowledgeSources.rawText}, 200)`,
      phase: knowledgeBitSchedules.phase,
      dueAt: knowledgeBitSchedules.dueAt,
      lapses: knowledgeBitSchedules.lapses,
      reviewCount: knowledgeBitSchedules.reviewCount,
      suspendedAt: knowledgeBitSchedules.suspendedAt,
      buriedUntil: knowledgeBitSchedules.buriedUntil,
      scheduleId: knowledgeBitSchedules.knowledgeBitId,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(and(eq(knowledgeBits.id, id), bitApproved));

  if (!row) {
    return null;
  }

  const variants = await readVariants(id, db);

  if (variants.length === 0) {
    return null;
  }

  const [tagNames, subjectRows] = await Promise.all([
    readTagNames(id, db),
    row.subjectId
      ? db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects)
      : Promise.resolve([]),
  ]);

  const state = deriveOverviewState(
    row.scheduleId
      ? { phase: row.phase ?? "review", suspendedAt: row.suspendedAt, buriedUntil: row.buriedUntil }
      : null,
    now,
  );
  const hasDue = row.scheduleId !== null && state !== "new" && state !== "suspended";

  return {
    knowledgeBitId: id,
    body: row.body,
    context: row.context?.trim() ? row.context : null,
    phrasings: variants.map((variant) => ({
      id: variant.id,
      kind: variant.kind as KnowledgeBitQuestionVariantKind,
      kindLabel: KNOWLEDGE_BIT_VARIANT_KIND_LABELS[variant.kind as KnowledgeBitQuestionVariantKind],
      prompt: variant.prompt,
      answer: variant.answer,
      sentence: variant.sentence,
    })),
    subjectPath: deriveSubjectPath(row.subjectId, subjectRows),
    tags: tagNames,
    origin: row.origin,
    addedBy: row.addedBy,
    sourceId: row.sourceId,
    sourceLabel: deriveBrowserSourceLabel({ sourceUrl: row.sourceUrl, rawText: row.sourceText }),
    sourceUrl: row.sourceUrl,
    addedAt: row.createdAt.toISOString(),
    review: {
      state,
      dueAt: hasDue && row.dueAt ? row.dueAt.toISOString() : null,
      lapses: row.lapses ?? 0,
      reviewCount: row.reviewCount ?? 0,
    },
  };
}
