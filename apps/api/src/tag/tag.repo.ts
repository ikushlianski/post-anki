import { and, eq, inArray, or } from "drizzle-orm";
import type { NodeType, Tag, TagAssignment } from "@post-anki/shared";
import { normalizeTagName } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { tagAssignments, tags, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";

function rowToTag(row: typeof tags.$inferSelect): Tag {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
  };
}

function rowToAssignment(row: typeof tagAssignments.$inferSelect): TagAssignment {
  return {
    id: row.id,
    tagId: row.tagId,
    nodeType: row.nodeType as NodeType,
    nodeId: row.nodeId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTags(): Promise<Tag[]> {
  const rows = await getDb().select().from(tags).orderBy(tags.name);

  return rows.map(rowToTag);
}

export async function getTag(tagId: string): Promise<Tag | null> {
  const rows = await getDb().select().from(tags).where(eq(tags.id, tagId));

  return rows[0] ? rowToTag(rows[0]) : null;
}

/**
 * Resolves an existing tag by its normalized name, or creates one — the
 * single write path used both by the learner-facing tag picker (typing a
 * name) and by AI-suggested tags from curriculum generation, so a
 * case-insensitive match always reuses the same row (SCENARIO 13, 15).
 */
export async function resolveOrCreateTag(name: string): Promise<Tag> {
  const trimmedName = name.trim();
  const normalizedName = normalizeTagName(trimmedName);
  const db = getDb();

  const existing = (
    await db.select().from(tags).where(eq(tags.normalizedName, normalizedName))
  )[0];

  if (existing) {
    return rowToTag(existing);
  }

  const row = {
    id: newId("tag"),
    name: trimmedName,
    normalizedName,
  };

  try {
    await db.insert(tags).values(row);
  } catch {
    // A concurrent request created the same normalized tag first — read it
    // back instead of erroring, since the outcome (this tag exists) is the
    // same either way.
    const raced = (
      await db.select().from(tags).where(eq(tags.normalizedName, normalizedName))
    )[0];

    if (raced) {
      return rowToTag(raced);
    }

    throw new Error(`failed to resolve or create tag "${trimmedName}"`);
  }

  return rowToTag({ ...row, createdAt: new Date() });
}

export async function assignTag(
  tagId: string,
  nodeType: NodeType,
  nodeId: string,
): Promise<TagAssignment> {
  const db = getDb();

  const existing = (
    await db
      .select()
      .from(tagAssignments)
      .where(
        and(
          eq(tagAssignments.tagId, tagId),
          eq(tagAssignments.nodeType, nodeType),
          eq(tagAssignments.nodeId, nodeId),
        ),
      )
  )[0];

  if (existing) {
    return rowToAssignment(existing);
  }

  const row = {
    id: newId("tga"),
    tagId,
    nodeType,
    nodeId,
  };

  await db.insert(tagAssignments).values(row);

  return rowToAssignment({ ...row, createdAt: new Date() });
}

export async function removeTagAssignment(
  tagId: string,
  assignmentId: string,
): Promise<boolean> {
  const db = getDb();

  const existing = (
    await db
      .select()
      .from(tagAssignments)
      .where(
        and(eq(tagAssignments.id, assignmentId), eq(tagAssignments.tagId, tagId)),
      )
  )[0];

  if (!existing) {
    return false;
  }

  await db.delete(tagAssignments).where(eq(tagAssignments.id, assignmentId));

  return true;
}

/**
 * All tag assignments for a batch of module/topic node ids in one query —
 * used by `getCurriculumDetail` to attach `tags: Tag[]` to every module and
 * topic without an N+1 query per node.
 */
export async function listAssignmentsForNodes(
  nodeIds: string[],
): Promise<TagAssignment[]> {
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

  const assignments = await db
    .select()
    .from(tagAssignments)
    .where(eq(tagAssignments.tagId, tagId));

  if (assignments.length === 0) {
    return [];
  }

  const directTopicIds = assignments
    .filter((a) => a.nodeType === "topic")
    .map((a) => a.nodeId);
  const moduleIds = assignments
    .filter((a) => a.nodeType === "module")
    .map((a) => a.nodeId);

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
  }));
}
