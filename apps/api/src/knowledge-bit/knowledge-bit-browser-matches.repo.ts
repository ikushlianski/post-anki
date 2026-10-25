import { and, asc, cosineDistance, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  KNOWLEDGE_BIT_MATCHES_MAX,
  KNOWLEDGE_BIT_MATCHES_MIN_SIMILARITY,
  type KnowledgeBitBrowserMatch,
  type KnowledgeBitBrowserMatchesQuery,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, knowledgeBits, knowledgeBitSchedules, knowledgeSources, topics } from "../db/schema.js";
import { applyEfSearch } from "../db/vector-search.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { buildBrowserFilterCondition, sourceTypeSql } from "./knowledge-bit-browser-filters.js";
import { assembleBrowserItems } from "./knowledge-bit-browser-items.js";
import { browserSubjectScopeIds, hasActiveVariant } from "./knowledge-bit-browser.repo.js";

type MatchFilters = Omit<KnowledgeBitBrowserMatchesQuery, "q">;

export interface BrowserMatchesScope {
  readyCount: number;
  notReadyCount: number;
}

export interface BrowserMatchesRanking {
  items: KnowledgeBitBrowserMatch[];
  capped: boolean;
}

async function scopeWhere({ subjectId, ...filters }: MatchFilters, db: DbExecutor, now: Date) {
  const subjectScopeIds = await browserSubjectScopeIds(subjectId, db);

  return and(
    bitApproved,
    hasActiveVariant(db),
    buildBrowserFilterCondition(filters, { db, now, subjectScopeIds, subjectId }),
  );
}

export async function countBrowserMatchesScope(
  filters: MatchFilters,
  db: DbExecutor = getDb(),
  now: Date = new Date(),
): Promise<BrowserMatchesScope> {
  const where = await scopeWhere(filters, db, now);
  const [row] = await db
    .select({
      ready: sql<number>`count(*) filter (where ${isNotNull(knowledgeBits.embeddingVec)})::int`,
      notReady: sql<number>`count(*) filter (where ${isNull(knowledgeBits.embeddingVec)})::int`,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(where);

  return { readyCount: row?.ready ?? 0, notReadyCount: row?.notReady ?? 0 };
}

export async function rankBrowserMatches(
  queryEmbedding: number[],
  filters: MatchFilters,
  db: DbExecutor,
  now: Date = new Date(),
): Promise<BrowserMatchesRanking> {
  const where = await scopeWhere(filters, db, now);
  const distance = cosineDistance(knowledgeBits.embeddingVec, queryEmbedding);
  const similarity = sql<number>`1 - (${distance})`;

  await applyEfSearch(db, KNOWLEDGE_BIT_MATCHES_MAX + 1, true);

  const rows = await db
    .select({
      id: knowledgeBits.id,
      origin: sourceTypeSql,
      createdAt: knowledgeBits.createdAt,
      sourceUrl: knowledgeSources.sourceUrl,
      sourceId: knowledgeSources.id,
      sourceText: sql<string | null>`left(${knowledgeSources.rawText}, 200)`,
      similarity,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(
      and(where, isNotNull(knowledgeBits.embeddingVec), sql`${similarity} >= ${KNOWLEDGE_BIT_MATCHES_MIN_SIMILARITY}`),
    )
    .orderBy(distance, asc(knowledgeBits.id))
    .limit(KNOWLEDGE_BIT_MATCHES_MAX + 1);

  const kept = rows.slice(0, KNOWLEDGE_BIT_MATCHES_MAX);
  const scores = new Map(kept.map((row) => [row.id, Number(row.similarity)]));
  const items = await assembleBrowserItems(kept, db);

  return {
    items: items.map((item) => ({ ...item, similarity: scores.get(item.knowledgeBitId) ?? 0 })),
    capped: rows.length > KNOWLEDGE_BIT_MATCHES_MAX,
  };
}

export async function rankBrowserMatchesInTransaction(
  queryEmbedding: number[],
  filters: MatchFilters,
  db: DbExecutor = getDb(),
  now: Date = new Date(),
): Promise<BrowserMatchesRanking> {
  return db.transaction((tx) => rankBrowserMatches(queryEmbedding, filters, tx, now));
}
