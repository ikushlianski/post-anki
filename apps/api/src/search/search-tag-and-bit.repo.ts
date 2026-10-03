import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import type { SearchResultTag, TopicModuleSearchResult } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, knowledgeBits, modules, tagAssignments, tags, topics } from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";

// discovery-and-navigation — shared across every search/tag-browse query
// that returns topics; mirrors slice-release.ts's nextUnreleasedTopicIds
// predicate (NULL-safe, only the literal "declined" excludes a topic).
export const topicNotDeclined = sql`${topics.releaseState} IS DISTINCT FROM 'declined'`;

// Batches every tag (id and name, so a result can link to its tag page) attached to a set of
// nodes of one kind — reused by every search path below so a topic/module/bit result can show
// which tag(s) it belongs to.
export async function tagsByNode(
  db: ReturnType<typeof getDb>,
  nodeType: "topic" | "module" | "knowledgeBit",
  nodeIds: string[],
): Promise<Map<string, SearchResultTag[]>> {
  if (nodeIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ nodeId: tagAssignments.nodeId, id: tags.id, name: tags.name })
    .from(tagAssignments)
    .innerJoin(tags, eq(tags.id, tagAssignments.tagId))
    .where(and(eq(tagAssignments.nodeType, nodeType), inArray(tagAssignments.nodeId, nodeIds)));

  const map = new Map<string, SearchResultTag[]>();

  for (const row of rows) {
    const existing = map.get(row.nodeId) ?? [];
    existing.push({ id: row.id, name: row.name });
    map.set(row.nodeId, existing);
  }

  return map;
}

// A ranked complement to searchTopicsAndModulesRanked — same tsvector/ts_rank approach, over
// knowledge-bit prose instead of topic/module titles. A bit's curriculum context is nullable:
// only set once the placement scan has matched it to a topic.
export async function searchKnowledgeBitsRanked(
  query: string,
  limit: number,
): Promise<TopicModuleSearchResult[]> {
  const db = getDb();

  const bitMatch = sql`${knowledgeBits.searchVector} @@ plainto_tsquery('english', ${query})`;
  const bitRank = sql<number>`ts_rank(${knowledgeBits.searchVector}, plainto_tsquery('english', ${query}))`;

  const rows = await db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      curriculumId: curricula.id,
      curriculumName: curricula.name,
      rank: bitRank,
    })
    .from(knowledgeBits)
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(and(bitMatch, bitApproved))
    .orderBy(sql`${bitRank} DESC`)
    .limit(limit);

  const bitTags = await tagsByNode(
    db,
    "knowledgeBit",
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    id: row.id,
    kind: "bit" as const,
    title: row.body.length > 120 ? `${row.body.slice(0, 117)}...` : row.body,
    curriculumId: row.curriculumId,
    curriculumName: row.curriculumName,
    rank: row.rank,
    tags: bitTags.get(row.id) ?? [],
  }));
}

// A fixed rank above any realistic ts_rank score — an exact/partial tag-name match is a
// stronger signal than partial full-text overlap, so a tag hit always sorts to the top.
const TAG_NAME_MATCH_RANK = 1;

// A query matching 50+ distinct tag names by substring is already a degenerate case — caps the
// tags themselves before the (potentially much larger) assignment lookup below ever runs.
const TAG_NAME_MATCH_LIMIT = 50;

// Personal-app scale cap on the tag-assignment lookup, matching LIST_TAG_NODES_LIMIT's
// precedent (list-nodes-by-tag.repo.ts) so a tag with a huge assignment count can't pull the
// whole table into memory before merged.slice(0, limit) runs below.
const TAG_ASSIGNMENT_MATCH_LIMIT = 500;

// Lets the same search query match a tag's name directly, surfacing every topic, module, and
// knowledge bit assigned that tag — "find cards by tag name" alongside the title/body match above.
export async function searchByTagNameAcrossNodes(
  query: string,
  limit: number,
): Promise<TopicModuleSearchResult[]> {
  const db = getDb();

  const matchingTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(ilike(tags.name, `%${query}%`))
    .orderBy(tags.name, tags.id)
    .limit(TAG_NAME_MATCH_LIMIT);

  if (matchingTags.length === 0) {
    return [];
  }

  const tagIds = matchingTags.map((tag) => tag.id);
  const tagNameById = new Map(matchingTags.map((tag) => [tag.id, tag.name]));

  // Kind-first ordering (topic, then module, then bit) mirrors merged.slice(0, limit) below —
  // a tag with hundreds of bit assignments must not push a topic out of this cap.
  const assignmentRows = await db
    .select({
      tagId: tagAssignments.tagId,
      nodeType: tagAssignments.nodeType,
      nodeId: tagAssignments.nodeId,
    })
    .from(tagAssignments)
    .where(inArray(tagAssignments.tagId, tagIds))
    .orderBy(
      sql`case ${tagAssignments.nodeType} when 'topic' then 0 when 'module' then 1 when 'knowledgeBit' then 2 else 3 end`,
      tagAssignments.tagId,
      tagAssignments.nodeId,
    )
    .limit(TAG_ASSIGNMENT_MATCH_LIMIT);

  const matchedTagsByNode = new Map<string, SearchResultTag[]>();

  for (const assignment of assignmentRows) {
    const name = tagNameById.get(assignment.tagId);

    if (!name) {
      continue;
    }

    const existing = matchedTagsByNode.get(assignment.nodeId) ?? [];
    existing.push({ id: assignment.tagId, name });
    matchedTagsByNode.set(assignment.nodeId, existing);
  }

  const topicIds = assignmentRows.filter((a) => a.nodeType === "topic").map((a) => a.nodeId);
  const moduleIds = assignmentRows.filter((a) => a.nodeType === "module").map((a) => a.nodeId);
  const bitIds = assignmentRows.filter((a) => a.nodeType === "knowledgeBit").map((a) => a.nodeId);

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
          .orderBy(topics.id)
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
          .orderBy(modules.id)
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
          .where(and(inArray(knowledgeBits.id, bitIds), bitApproved))
          .orderBy(knowledgeBits.id)
      : Promise.resolve([]),
  ]);

  // Full tag sets, not just the matched tag — a node that wins this path can carry other,
  // unrelated tags too, and dropping them here would under-report what matchedTagNamesByNode
  // (the subset that actually matched the query) alone would show.
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
      rank: TAG_NAME_MATCH_RANK,
      tags: topicTags.get(row.id) ?? matchedTagsByNode.get(row.id) ?? [],
    })),
    ...moduleRows.map((row) => ({
      ...row,
      kind: "module" as const,
      rank: TAG_NAME_MATCH_RANK,
      tags: moduleTags.get(row.id) ?? matchedTagsByNode.get(row.id) ?? [],
    })),
    ...bitRows.map((row) => ({
      id: row.id,
      kind: "bit" as const,
      title: row.body.length > 120 ? `${row.body.slice(0, 117)}...` : row.body,
      curriculumId: row.curriculumId,
      curriculumName: row.curriculumName,
      rank: TAG_NAME_MATCH_RANK,
      tags: bitTags.get(row.id) ?? matchedTagsByNode.get(row.id) ?? [],
    })),
  ];

  return merged.slice(0, limit);
}
