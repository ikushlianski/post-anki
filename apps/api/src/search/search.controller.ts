import type http from "node:http";
import type { SearchResponse, TopicModuleSearchResult } from "@post-anki/shared";
import { normalizeSearchQuery } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import {
  searchCurricula,
  searchSubjects,
  searchTopics,
  searchTopicsAndModulesRanked,
} from "./search.repo.js";

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

  const results = await searchTopicsAndModulesRanked(normalized, limit);

  sendJson(res, 200, results);
}
