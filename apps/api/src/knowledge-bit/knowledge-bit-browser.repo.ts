import { and, asc, count, desc, eq, exists, isNull, sql } from "drizzle-orm";
import { collectSubjectSubtreeIds } from "@post-anki/core";
import {
  KNOWLEDGE_BIT_BROWSER_NO_SUBJECT,
  type KnowledgeBitBrowserPage,
  type KnowledgeBitBrowserQuery,
  type KnowledgeBitBrowserSubjectCounts,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitNoteSchedules,
  knowledgeSources,
  subjects,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { buildBrowserFilterCondition, sourceTypeSql } from "./knowledge-bit-browser-filters.js";
import { assembleBrowserItems } from "./knowledge-bit-browser-items.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";
import { rollUpCardCounts } from "../subject/subject-card-count.repo.js";

const MATURE_INTERVAL_DAYS = 21;

export const hasActiveVariant = (db: DbExecutor) =>
  exists(
    db
      .select({ one: knowledgeBitQuestionVariants.id })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      ),
  );

export async function browserSubjectScopeIds(
  subjectId: string | undefined,
  db: DbExecutor,
): Promise<string[] | null> {
  if (!subjectId || subjectId === KNOWLEDGE_BIT_BROWSER_NO_SUBJECT) {
    return null;
  }

  return collectSubjectSubtreeIds(
    subjectId,
    await db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
  );
}

export async function listKnowledgeBitBrowser(
  { subjectId, limit, offset, ...filters }: KnowledgeBitBrowserQuery,
  db: DbExecutor = getDb(),
  now: Date = new Date(),
): Promise<KnowledgeBitBrowserPage> {
  const subjectScopeIds = await browserSubjectScopeIds(subjectId, db);
  const where = and(
    bitApproved,
    hasActiveVariant(db),
    buildBrowserFilterCondition(filters, { db, now, subjectScopeIds, subjectId }),
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: knowledgeBits.id,
        origin: sourceTypeSql,
        createdAt: knowledgeBits.createdAt,
        sourceUrl: knowledgeSources.sourceUrl,
        sourceId: knowledgeSources.id,
        sourceText: sql<string | null>`left(${knowledgeSources.rawText}, 200)`,
      })
      .from(knowledgeBits)
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .leftJoin(knowledgeBitNoteSchedules, eq(knowledgeBitNoteSchedules.knowledgeBitId, knowledgeBits.id))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .where(where)
      .orderBy(desc(knowledgeBits.createdAt), asc(knowledgeBits.id))
      .limit(limit + 1)
      .offset(offset),
    db
      .select({ total: count() })
      .from(knowledgeBits)
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .leftJoin(knowledgeBitNoteSchedules, eq(knowledgeBitNoteSchedules.knowledgeBitId, knowledgeBits.id))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .where(where),
  ]);

  const items = await assembleBrowserItems(rows.slice(0, limit), db);

  return { items, hasMore: rows.length > limit, total: totalRow?.total ?? 0 };
}

export async function countKnowledgeBitBrowserSubjects(
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitBrowserSubjectCounts> {
  const [rows, nodes] = await Promise.all([
    db
      .select({
        subjectId: effectiveSubjectIdSql,
        count: sql<number>`count(*)::int`,
        newCount: sql<number>`count(*) filter (where ${knowledgeBitNoteSchedules.phase} is null or ${knowledgeBitNoteSchedules.phase} = 'new')::int`,
        matureCount: sql<number>`count(*) filter (where ${knowledgeBitNoteSchedules.phase} = 'review' and ${knowledgeBitNoteSchedules.intervalDays} >= ${MATURE_INTERVAL_DAYS})::int`,
      })
      .from(knowledgeBits)
      .leftJoin(knowledgeBitNoteSchedules, eq(knowledgeBitNoteSchedules.knowledgeBitId, knowledgeBits.id))
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .where(and(bitApproved, hasActiveVariant(db)))
      .groupBy(effectiveSubjectIdSql),
    db.select({ id: subjects.id, parentId: subjects.parentId }).from(subjects),
  ]);

  const own = (field: "count" | "newCount" | "matureCount") =>
    new Map(rows.flatMap((row) => (row.subjectId === null ? [] : [[row.subjectId, row[field]] as const])));
  const totals = rollUpCardCounts(nodes, own("count"));
  const newTotals = rollUpCardCounts(nodes, own("newCount"));
  const matureTotals = rollUpCardCounts(nodes, own("matureCount"));

  const rolledUp = nodes.flatMap(({ id }) => {
    const count = totals.get(id) ?? 0;

    if (count === 0) {
      return [];
    }

    const newCount = newTotals.get(id) ?? 0;
    const matureCount = matureTotals.get(id) ?? 0;

    return [{ subjectId: id, count, newCount, learningCount: count - newCount - matureCount, matureCount }];
  });
  const unsorted = rows.find((row) => row.subjectId === null);

  return [
    ...rolledUp,
    ...(unsorted
      ? [
          {
            subjectId: null,
            count: unsorted.count,
            newCount: unsorted.newCount,
            learningCount: unsorted.count - unsorted.newCount - unsorted.matureCount,
            matureCount: unsorted.matureCount,
          },
        ]
      : []),
  ];
}
