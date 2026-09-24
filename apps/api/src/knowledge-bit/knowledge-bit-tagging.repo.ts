import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";

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

export async function markKnowledgeBitTagged(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.update(knowledgeBits).set({ taggedAt: new Date() }).where(eq(knowledgeBits.id, id));
}

export async function markKnowledgeBitTagFailed(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ tagFailedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}
