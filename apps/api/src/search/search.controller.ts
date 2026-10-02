import type http from "node:http";
import type { ListTagNodesResponse, SearchResponse, TopicModuleSearchResult } from "@post-anki/shared";
import { normalizeSearchQuery } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import {
  searchCurricula,
  searchSubjects,
  searchTopics,
  searchTopicsAndModulesRanked,
} from "./search.repo.js";
import { searchByTagNameAcrossNodes, searchKnowledgeBitsRanked } from "./search-tag-and-bit.repo.js";
import { listNodesByTagId } from "./list-nodes-by-tag.repo.js";

const TOPIC_MODULE_SEARCH_DEFAULT_LIMIT = 10;

export async function handleSearch(
  res: http.ServerResponse,
  queryParam: string | null,
): Promise<void> {
  const normalized = normalizeSearchQuery(queryParam ?? "");

  if (normalized === null) {
    sendJson(res, 200, { subjects: [], curricula: [], topics: [] } satisfies SearchResponse);
    return;
  }

  const [subjectRows, curriculumRows, topicRows] = await Promise.all([
    searchSubjects(normalized),
    searchCurricula(normalized),
    searchTopics(normalized),
  ]);

  const body: SearchResponse = {
    subjects: subjectRows.map((s) => ({ id: s.id, label: s.name })),
    curricula: curriculumRows.map((c) => ({ id: c.id, label: c.name })),
    topics: topicRows.map((t) => ({ id: t.id, label: t.title, curriculumId: t.curriculumId })),
  };

  sendJson(res, 200, body);
}

export async function handleSearchTopicsAndModules(
  res: http.ServerResponse,
  queryParam: string | null,
  limitParam: string | null,
): Promise<void> {
  const normalized = normalizeSearchQuery(queryParam ?? "");

  if (normalized === null) {
    sendJson(res, 200, [] satisfies TopicModuleSearchResult[]);
    return;
  }

  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 50)
      : TOPIC_MODULE_SEARCH_DEFAULT_LIMIT;

  const [titleMatches, bitMatches, tagMatches] = await Promise.all([
    searchTopicsAndModulesRanked(normalized, limit),
    searchKnowledgeBitsRanked(normalized, limit),
    searchByTagNameAcrossNodes(normalized, limit),
  ]);

  const byKindAndId = new Map<string, TopicModuleSearchResult>();

  for (const result of [...titleMatches, ...bitMatches, ...tagMatches]) {
    const key = `${result.kind}-${result.id}`;
    const existing = byKindAndId.get(key);

    if (!existing || result.rank > existing.rank) {
      byKindAndId.set(key, result);
    }
  }

  const results = Array.from(byKindAndId.values())
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  sendJson(res, 200, results);
}

// Browse everything under one exact tag id — not a name search.
export async function handleListTagNodes(res: http.ServerResponse, tagId: string): Promise<void> {
  const results = await listNodesByTagId(tagId);

  sendJson(res, 200, results satisfies ListTagNodesResponse);
}
