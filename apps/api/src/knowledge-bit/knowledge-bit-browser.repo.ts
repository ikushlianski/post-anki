import { and, asc, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { collectSubjectSubtreeIds } from "@post-anki/core";
import {
  KNOWLEDGE_BIT_BROWSER_NO_SUBJECT,
  type KnowledgeBitBrowserPage,
  type KnowledgeBitBrowserQuery,
  type KnowledgeBitBrowserSubjectCounts,
  type KnowledgeBitQuestionVariantKind,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeSources,
  subjects,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { deriveBrowserOrigin } from "./knowledge-bit-browser-origin.js";
import { pickPreferredVariants } from "./knowledge-bit-preferred-variant.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";
import { ANKI_VARIANT_KIND_PREFERENCE } from "./knowledge-bit-variant-kind-rules.js";

const hasActiveVariant = (db: DbExecutor) =>
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

function kindRank(kind: string): number {
  const index = (ANKI_VARIANT_KIND_PREFERENCE as readonly string[]).indexOf(kind);

  return index === -1 ? ANKI_VARIANT_KIND_PREFERENCE.length : index;
}

export async function listKnowledgeBitBrowser(
  { subjectId, limit, offset }: KnowledgeBitBrowserQuery,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitBrowserPage> {
  const unassignedOnly = subjectId === KNOWLEDGE_BIT_BROWSER_NO_SUBJECT;
  const scopeIds = subjectId && !unassignedOnly
    ? collectSubjectSubtreeIds(
        subjectId,
        await db
          .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId })
          .from(subjects),
      )
    : null;

  const rows = await db
    .select({
      id: knowledgeBits.id,
      origin: knowledgeBits.origin,
      isAiGenerated: knowledgeBits.isAiGenerated,
      createdAt: knowledgeBits.createdAt,
      sourceKind: knowledgeSources.kind,
      sourceUrl: knowledgeSources.sourceUrl,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(
      and(
        bitApproved,
        hasActiveVariant(db),
        scopeIds ? inArray(effectiveSubjectIdSql, scopeIds) : undefined,
        unassignedOnly ? isNull(effectiveSubjectIdSql) : undefined,
      ),
    )
    .orderBy(desc(knowledgeBits.createdAt), asc(knowledgeBits.id))
    .limit(limit + 1)
    .offset(offset);

  const pageRows = rows.slice(0, limit);

  if (pageRows.length === 0) {
    return { items: [], hasMore: false };
  }

  const variantRows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      order: knowledgeBitQuestionVariants.order,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      createdAt: knowledgeBitQuestionVariants.createdAt,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(
          knowledgeBitQuestionVariants.knowledgeBitId,
          pageRows.map((row) => row.id),
        ),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );

  const preferred = pickPreferredVariants(variantRows);

  const items = pageRows.flatMap((row) => {
    const answer = preferred.get(row.id)?.answer;
    const phrasings = variantRows
      .filter((variant) => variant.knowledgeBitId === row.id)
      .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.order - b.order)
      .map((variant) => ({
        id: variant.id,
        kind: variant.kind as KnowledgeBitQuestionVariantKind,
        prompt: variant.prompt,
      }));

    if (answer === undefined || phrasings.length === 0) {
      return [];
    }

    return [
      {
        knowledgeBitId: row.id,
        phrasings,
        answer,
        origin: deriveBrowserOrigin({
          origin: row.origin,
          isAiGenerated: row.isAiGenerated,
          sourceKind: row.sourceKind,
          sourceUrl: row.sourceUrl,
        }),
        addedAt: row.createdAt.toISOString(),
      },
    ];
  });

  return { items, hasMore: rows.length > limit };
}

export async function countKnowledgeBitBrowserSubjects(
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitBrowserSubjectCounts> {
  const rows = await db
    .select({ subjectId: effectiveSubjectIdSql, count: sql<number>`count(*)::int` })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(and(bitApproved, hasActiveVariant(db)))
    .groupBy(effectiveSubjectIdSql);

  return rows.map((row) => ({ subjectId: row.subjectId, count: row.count }));
}
