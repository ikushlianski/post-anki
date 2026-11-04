import { and, eq } from "drizzle-orm";
import type { Tag, TagAssignment, TagNodeType } from "@post-anki/shared";
import { normalizeTagName } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { tagAssignments, tags } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { rowToAssignment, rowToTag } from "./tag-read.repo.js";

export type RenameTagError = "not_found" | "name_taken";

export async function renameTag(
  tagId: string,
  name: string,
): Promise<Tag | { error: RenameTagError }> {
  const trimmedName = name.trim();
  const normalizedName = normalizeTagName(trimmedName);

  return getDb().transaction(async (tx) => {
    const current = (await tx.select().from(tags).where(eq(tags.id, tagId)))[0];

    if (!current) {
      return { error: "not_found" as const };
    }

    const clash = (await tx.select().from(tags).where(eq(tags.normalizedName, normalizedName)))[0];

    if (clash && clash.id !== tagId) {
      return { error: "name_taken" as const };
    }

    const updated = (
      await tx
        .update(tags)
        .set({ name: trimmedName, normalizedName })
        .where(eq(tags.id, tagId))
        .returning()
    )[0]!;

    return rowToTag(updated);
  });
}

export async function deleteTag(tagId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const existing = (await tx.select().from(tags).where(eq(tags.id, tagId)))[0];

    if (!existing) {
      return false;
    }

    await tx.delete(tagAssignments).where(eq(tagAssignments.tagId, tagId));
    await tx.delete(tags).where(eq(tags.id, tagId));

    return true;
  });
}

/**
 * Resolves an existing tag by its normalized name, or creates one — the
 * single write path used both by the learner-facing tag picker (typing a
 * name) and by AI-suggested tags from curriculum generation, so a
 * case-insensitive match always reuses the same row (SCENARIO 13, 15).
 */
export async function resolveOrCreateTag(name: string, db: DbExecutor = getDb()): Promise<Tag> {
  const trimmedName = name.trim();
  const normalizedName = normalizeTagName(trimmedName);

  const existing = (await db.select().from(tags).where(eq(tags.normalizedName, normalizedName)))[0];

  if (existing) {
    return rowToTag(existing);
  }

  const row = {
    id: newId("tag"),
    name: trimmedName,
    normalizedName,
  };

  try {
    // Nested inside a SAVEPOINT (drizzle-orm/node-postgres implements a
    // nested .transaction() call this way) so a unique-violation here only
    // rolls back this insert, not the whole transaction — otherwise, when
    // `db` is an already-open tx (e.g. resolveTagUnderCapGuard's held
    // lock), a real race would abort that outer transaction (Postgres
    // 25P02) and the re-select below would throw instead of recovering.
    await db.transaction(async (nestedTx) => {
      await nestedTx.insert(tags).values(row);
    });
  } catch {
    // A concurrent request created the same normalized tag first — read it
    // back instead of erroring, since the outcome (this tag exists) is the
    // same either way.
    const raced = (await db.select().from(tags).where(eq(tags.normalizedName, normalizedName)))[0];

    if (raced) {
      return rowToTag(raced);
    }

    throw new Error(`failed to resolve or create tag "${trimmedName}"`);
  }

  return rowToTag({ ...row, createdAt: new Date() });
}

// Manual path — always upgrades to source "manual", even on conflict with an existing auto row.
export async function assignTag(
  tagId: string,
  nodeType: TagNodeType,
  nodeId: string,
  db: DbExecutor = getDb(),
): Promise<TagAssignment> {
  const row = {
    id: newId("tga"),
    tagId,
    nodeType,
    nodeId,
    source: "manual" as const,
  };

  const inserted = (
    await db
      .insert(tagAssignments)
      .values(row)
      .onConflictDoUpdate({
        target: [tagAssignments.tagId, tagAssignments.nodeType, tagAssignments.nodeId],
        set: { source: "manual" },
      })
      .returning()
  )[0]!;

  return rowToAssignment(inserted);
}

// Auto path (AI-proposed tags: curriculum module tags, knowledge-bit auto-tagging) — never
// downgrades an existing manual row, since onConflictDoNothing leaves it untouched.
export async function assignAutoTag(
  tagId: string,
  nodeType: TagNodeType,
  nodeId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .insert(tagAssignments)
    .values({ id: newId("tga"), tagId, nodeType, nodeId, source: "auto" })
    .onConflictDoNothing({
      target: [tagAssignments.tagId, tagAssignments.nodeType, tagAssignments.nodeId],
    });
}

export async function removeTagAssignment(tagId: string, assignmentId: string): Promise<boolean> {
  const db = getDb();

  const existing = (
    await db
      .select()
      .from(tagAssignments)
      .where(and(eq(tagAssignments.id, assignmentId), eq(tagAssignments.tagId, tagId)))
  )[0];

  if (!existing) {
    return false;
  }

  await db.delete(tagAssignments).where(eq(tagAssignments.id, assignmentId));

  return true;
}
