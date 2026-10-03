import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import type { TopicModuleSearchResult } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, modules, subjects, topics } from "../db/schema.js";
import { tagsByNode, topicNotDeclined } from "./search-tag-and-bit.repo.js";

export interface SearchSubjectResult {
  id: string;
  name: string;
}

export interface SearchCurriculumResult {
  id: string;
  name: string;
}

export interface SearchTopicResult {
  id: string;
  title: string;
  curriculumId: string;
}

// Personal-app scale cap on the plain name-match queries below, well above
// SEARCH_KNOWLEDGE_ITEMS_MAX_LIMIT (200) so a legitimate match is never cut
// before the caller's own sort-then-slice(0, limit) runs — see
// LIST_TAG_NODES_LIMIT in list-nodes-by-tag.repo.ts for the same shape.
export const SEARCH_NAME_MATCH_LIMIT = 500;

export async function searchSubjects(query: string): Promise<SearchSubjectResult[]> {
  return getDb()
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(ilike(subjects.name, `%${query}%`))
    .orderBy(subjects.name, subjects.id)
    .limit(SEARCH_NAME_MATCH_LIMIT);
}

// discovery-and-navigation — an unconfirmed curriculum (draft, awaiting
// source approval, shaping structure, ...) has no finished structure yet and
// must never surface in global search/tag browse.
const curriculumConfirmed = eq(curricula.status, "confirmed");

// learning-list-fold-in — mirrors listCurricula's exclusion of container
// curricula (curriculum.repo.ts's listCurricula): a container row is
// plumbing, never something the learner searches for by name.
export async function searchCurricula(query: string): Promise<SearchCurriculumResult[]> {
  return getDb()
    .select({ id: curricula.id, name: curricula.name })
    .from(curricula)
    .where(
      and(
        isNull(curricula.containerAreaNodeId),
        curriculumConfirmed,
        ilike(curricula.name, `%${query}%`),
      ),
    )
    .orderBy(curricula.name, curricula.id)
    .limit(SEARCH_NAME_MATCH_LIMIT);
}

export async function searchTopics(query: string): Promise<SearchTopicResult[]> {
  return getDb()
    .select({ id: topics.id, title: topics.title, curriculumId: topics.curriculumId })
    .from(topics)
    .where(and(topicNotDeclined, ilike(topics.title, `%${query}%`)))
    .orderBy(topics.title, topics.id)
    .limit(SEARCH_NAME_MATCH_LIMIT);
}

// A ranked, capped complement to searchTopics above — native Postgres
// full-text relevance (tsvector/ts_rank), matching notes' own search.
export async function searchTopicsAndModulesRanked(
  query: string,
  limit: number,
): Promise<TopicModuleSearchResult[]> {
  const db = getDb();

  const topicMatch = sql`${topics.searchVector} @@ plainto_tsquery('english', ${query})`;
  const topicRank = sql<number>`ts_rank(${topics.searchVector}, plainto_tsquery('english', ${query}))`;

  const moduleMatch = sql`${modules.searchVector} @@ plainto_tsquery('english', ${query})`;
  const moduleRank = sql<number>`ts_rank(${modules.searchVector}, plainto_tsquery('english', ${query}))`;

  const [topicRows, moduleRows] = await Promise.all([
    db
      .select({
        id: topics.id,
        title: topics.title,
        curriculumId: topics.curriculumId,
        curriculumName: curricula.name,
        rank: topicRank,
      })
      .from(topics)
      .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
      .where(and(topicMatch, topicNotDeclined))
      .orderBy(sql`${topicRank} DESC`)
      .limit(limit),
    db
      .select({
        id: modules.id,
        title: modules.title,
        curriculumId: modules.curriculumId,
        curriculumName: curricula.name,
        rank: moduleRank,
      })
      .from(modules)
      .innerJoin(curricula, eq(curricula.id, modules.curriculumId))
      .where(moduleMatch)
      .orderBy(sql`${moduleRank} DESC`)
      .limit(limit),
  ]);

  const [topicTags, moduleTags] = await Promise.all([
    tagsByNode(
      db,
      "topic",
      topicRows.map((row) => row.id),
    ),
    tagsByNode(
      db,
      "module",
      moduleRows.map((row) => row.id),
    ),
  ]);

  const merged: TopicModuleSearchResult[] = [
    ...topicRows.map((row) => ({ ...row, kind: "topic" as const, tags: topicTags.get(row.id) ?? [] })),
    ...moduleRows.map((row) => ({ ...row, kind: "module" as const, tags: moduleTags.get(row.id) ?? [] })),
  ];

  return merged.sort((a, b) => b.rank - a.rank).slice(0, limit);
}
