import { and, eq, inArray, sql } from "drizzle-orm";
import type { ListTagNodesResponse, TopicModuleSearchResult } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, knowledgeBits, modules, tagAssignments, topics } from "../db/schema.js";
import { tagsByNode, topicNotDeclined } from "./search-tag-and-bit.repo.js";

const KIND_ORDER: Record<TopicModuleSearchResult["kind"], number> = {
  topic: 0,
  module: 1,
  bit: 2,
};

// Personal-app scale cap, not real pagination — see search.ts's ListTagNodesResponse.
export const LIST_TAG_NODES_LIMIT = 500;

// Exact-tag-id browse; capped at LIST_TAG_NODES_LIMIT, ordered by kind then id so the cut is stable.
export async function listNodesByTagId(tagId: string): Promise<ListTagNodesResponse> {
  const db = getDb();

  const assignmentRows = await db
    .select({
      nodeType: tagAssignments.nodeType,
      nodeId: tagAssignments.nodeId,
    })
    .from(tagAssignments)
    .where(eq(tagAssignments.tagId, tagId))
    .orderBy(
      sql`case ${tagAssignments.nodeType} when 'topic' then 0 when 'module' then 1 when 'knowledgeBit' then 2 else 3 end`,
      tagAssignments.nodeId,
    )
    .limit(LIST_TAG_NODES_LIMIT + 1);

  const capped = assignmentRows.length > LIST_TAG_NODES_LIMIT;
  const cappedAssignmentRows = capped
    ? assignmentRows.slice(0, LIST_TAG_NODES_LIMIT)
    : assignmentRows;

  if (cappedAssignmentRows.length === 0) {
    return { nodes: [], capped: false };
  }

  const topicIds = cappedAssignmentRows.filter((a) => a.nodeType === "topic").map((a) => a.nodeId);
  const moduleIds = cappedAssignmentRows
    .filter((a) => a.nodeType === "module")
    .map((a) => a.nodeId);
  const bitIds = cappedAssignmentRows
    .filter((a) => a.nodeType === "knowledgeBit")
    .map((a) => a.nodeId);

  const [topicRows, moduleRows, bitRows] = await Promise.all([
    topicIds.length > 0
      ? db
          .select({
            id: topics.id,
            title: topics.title,
            curriculumId: topics.curriculumId,
            curriculumName: curricula.name,
          })
          .from(topics)
          .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
          .where(and(inArray(topics.id, topicIds), topicNotDeclined))
      : Promise.resolve([]),
    moduleIds.length > 0
      ? db
          .select({
            id: modules.id,
            title: modules.title,
            curriculumId: modules.curriculumId,
            curriculumName: curricula.name,
          })
          .from(modules)
          .innerJoin(curricula, eq(curricula.id, modules.curriculumId))
          .where(inArray(modules.id, moduleIds))
      : Promise.resolve([]),
    bitIds.length > 0
      ? db
          .select({
            id: knowledgeBits.id,
            body: knowledgeBits.body,
            curriculumId: curricula.id,
            curriculumName: curricula.name,
          })
          .from(knowledgeBits)
          .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
          .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
          .where(inArray(knowledgeBits.id, bitIds))
      : Promise.resolve([]),
  ]);

  const [topicTags, moduleTags, bitTags] = await Promise.all([
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
    tagsByNode(
      db,
      "knowledgeBit",
      bitRows.map((row) => row.id),
    ),
  ]);

  const merged: TopicModuleSearchResult[] = [
    ...topicRows.map((row) => ({
      ...row,
      kind: "topic" as const,
      rank: 0,
      tags: topicTags.get(row.id) ?? [],
    })),
    ...moduleRows.map((row) => ({
      ...row,
      kind: "module" as const,
      rank: 0,
      tags: moduleTags.get(row.id) ?? [],
    })),
    ...bitRows.map((row) => ({
      id: row.id,
      kind: "bit" as const,
      title: row.body.length > 120 ? `${row.body.slice(0, 117)}...` : row.body,
      curriculumId: row.curriculumId,
      curriculumName: row.curriculumName,
      rank: 0,
      tags: bitTags.get(row.id) ?? [],
    })),
  ];

  const nodes = merged.sort((a, b) => {
    const kindDelta = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];

    return kindDelta !== 0 ? kindDelta : a.title.localeCompare(b.title);
  });

  return { nodes, capped };
}
