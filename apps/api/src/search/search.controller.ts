import type http from "node:http";
import type { SearchResponse } from "@post-anki/shared";
import { normalizeSearchQuery } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import { searchCurricula, searchSubjects, searchTopics } from "./search.repo.js";

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
