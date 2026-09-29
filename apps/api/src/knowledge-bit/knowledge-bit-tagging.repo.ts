import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";
import { assignAutoTag } from "../tag/tag.repo.js";

export interface KnowledgeBitForTaggingScan {
  id: string;
  body: string;
}

export async function listKnowledgeBitsForTaggingScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitForTaggingScan[]> {
  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
    })
    .from(knowledgeBits)
    .where(and(isNull(knowledgeBits.taggedAt), isNull(knowledgeBits.tagFailedAt)))
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

// Body guard: no-ops if the body changed since the scan read it, so the next scan retries.
export async function markKnowledgeBitTagged(
  id: string,
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ taggedAt: new Date() })
    .where(and(eq(knowledgeBits.id, id), eq(knowledgeBits.body, expectedBody)));
}

// Locks the bit row first (SELECT ... FOR UPDATE, mirrors gap-triage.repo.ts's
// convention), re-checks its body against what the scan read, then inserts
// every resolved tag assignment and marks it tagged — all inside one
// transaction. updateKnowledgeBitBody updates this same row before it
// deletes the bit's tag_assignments, so a concurrent edit and this call
// always serialize on the row lock: whichever commits first is fully visible
// to the other, and a stale scan can never insert a tag_assignments row
// after the edit's delete has already run. Returns false (no writes at all)
// when the body no longer matches, so the next scan retries the bit.
export async function assignTagsAndMarkTagged(
  id: string,
  tagIds: string[],
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ body: knowledgeBits.body })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, id))
      .for("update");

    const current = rows[0];

    if (!current || current.body !== expectedBody) {
      return false;
    }

    for (const tagId of tagIds) {
      await assignAutoTag(tagId, "knowledgeBit", id, tx);
    }

    await markKnowledgeBitTagged(id, expectedBody, tx);

    return true;
  });
}

export async function markKnowledgeBitTagFailed(
  id: string,
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ tagFailedAt: new Date() })
    .where(and(eq(knowledgeBits.id, id), eq(knowledgeBits.body, expectedBody)));
}
