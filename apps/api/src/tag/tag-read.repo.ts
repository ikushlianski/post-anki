import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Tag, TagAssignment, TagNodeType } from "@post-anki/shared";
import {
  DEFAULT_TAG_MASTERY_ENTRY,
  foldTagMastery,
  type MasteryEntryState,
} from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitQuestionVariants,
  knowledgeBitVariantAttempts,
  tagAssignments,
  tags,
  topics,
} from "../db/schema.js";

export function rowToTag(row: typeof tags.$inferSelect): Tag {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
  };
}

export function rowToAssignment(row: typeof tagAssignments.$inferSelect): TagAssignment {
  return {
    id: row.id,
    tagId: row.tagId,
    nodeType: row.nodeType as TagNodeType,
    nodeId: row.nodeId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTags(db: DbExecutor = getDb()): Promise<Tag[]> {
  const rows = await db.select().from(tags).orderBy(tags.name);

  return rows.map(rowToTag);
}

export async function getTag(tagId: string): Promise<Tag | null> {
  const rows = await getDb().select().from(tags).where(eq(tags.id, tagId));

  return rows[0] ? rowToTag(rows[0]) : null;
}

/**
 * All tag assignments for a batch of module/topic node ids in one query —
 * used by `getCurriculumDetail` to attach `tags: Tag[]` to every module and
 * topic without an N+1 query per node.
 */
export async function listAssignmentsForNodes(nodeIds: string[]): Promise<TagAssignment[]> {
  if (nodeIds.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(tagAssignments)
    .where(inArray(tagAssignments.nodeId, nodeIds));

  return rows.map(rowToAssignment);
}

export async function getTagsByIds(tagIds: string[]): Promise<Map<string, Tag>> {
  if (tagIds.length === 0) {
    return new Map();
  }

  const rows = await getDb().select().from(tags).where(inArray(tags.id, tagIds));

  return new Map(rows.map((row) => [row.id, rowToTag(row)]));
}

export interface TagTopicRow {
  id: string;
  title: string;
  summary: string | null;
  depth: string;
  curriculumId: string;
  priority: number;
}

/**
 * Every topic in scope for a tag-scoped probe session — the union of topics
 * directly tag-assigned and every included topic under a tag-assigned
 * module, deduplicated, spanning as many curricula as the tag touches
 * (SCENARIO 14). Confirmed-curriculum filtering happens at the call site in
 * probe-session.repo.ts, which already loads the curricula rows it needs.
 */
export async function listTopicsForTag(tagId: string): Promise<TagTopicRow[]> {
  const db = getDb();

  const assignments = await db.select().from(tagAssignments).where(eq(tagAssignments.tagId, tagId));

  if (assignments.length === 0) {
    return [];
  }

  const directTopicIds = assignments.filter((a) => a.nodeType === "topic").map((a) => a.nodeId);
  const moduleIds = assignments.filter((a) => a.nodeType === "module").map((a) => a.nodeId);

  const conditions = [];

  if (directTopicIds.length > 0) {
    conditions.push(inArray(topics.id, directTopicIds));
  }

  if (moduleIds.length > 0) {
    conditions.push(inArray(topics.moduleId, moduleIds));
  }

  if (conditions.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(topics)
    .where(and(eq(topics.included, true), or(...conditions)));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    depth: row.depth,
    curriculumId: row.curriculumId,
    priority: row.priority,
  }));
}

/**
 * Read-time mastery level per tag, folded from every scored knowledge-bit answer reachable from
 * that tag (tagAssignments(nodeType="knowledgeBit") -> knowledgeBitQuestionVariants ->
 * knowledgeBitVariantAttempts), ordered by createdAt ascending. No persisted cursor — a tag with
 * no attempts simply never appears in the returned map (caller treats a miss as the default "new"
 * entry, matching foldTagMastery's own behavior on an empty list).
 */
export async function getTagMasteryLevels(
  tagIds: string[],
): Promise<Map<string, MasteryEntryState>> {
  if (tagIds.length === 0) {
    return new Map();
  }

  const orderedVerdicts = sql<
    string[]
  >`array_agg(${knowledgeBitVariantAttempts.verdict} order by ${knowledgeBitVariantAttempts.createdAt} asc, ${knowledgeBitVariantAttempts.id} asc)`;

  const rows = await getDb()
    .select({ tagId: tagAssignments.tagId, verdicts: orderedVerdicts })
    .from(tagAssignments)
    .innerJoin(
      knowledgeBitQuestionVariants,
      eq(knowledgeBitQuestionVariants.knowledgeBitId, tagAssignments.nodeId),
    )
    .innerJoin(
      knowledgeBitVariantAttempts,
      eq(knowledgeBitVariantAttempts.variantId, knowledgeBitQuestionVariants.id),
    )
    .where(
      and(
        eq(tagAssignments.nodeType, "knowledgeBit"),
        inArray(tagAssignments.tagId, tagIds),
        sql`coalesce(${knowledgeBitVariantAttempts.feedback}, '') <> 'rehearsal'`,
      ),
    )
    .groupBy(tagAssignments.tagId);

  const result = new Map<string, MasteryEntryState>();

  for (const row of rows) {
    result.set(row.tagId, foldTagMastery(row.verdicts.map((verdict) => ({ verdict }))));
  }

  return result;
}

export interface TagMasteryStatusRow {
  tagId: string;
  name: string;
  status: MasteryEntryState["status"];
}

/**
 * Every tag with its mastery status, including one with zero scored attempts — getTagMasteryLevels
 * leaves those out of its map by design, so this fills in DEFAULT_TAG_MASTERY_ENTRY's "new" status
 * for any tag missing from it. Read-time only, no persistence.
 */
export async function getTagMasteryStatuses(
  db: DbExecutor = getDb(),
): Promise<TagMasteryStatusRow[]> {
  const allTags = await listTags(db);
  const levels = await getTagMasteryLevels(allTags.map((tag) => tag.id));

  return allTags.map((tag) => ({
    tagId: tag.id,
    name: tag.name,
    status: (levels.get(tag.id) ?? DEFAULT_TAG_MASTERY_ENTRY).status,
  }));
}
