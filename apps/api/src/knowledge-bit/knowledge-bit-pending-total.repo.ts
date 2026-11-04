import { and, count, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";

export function pendingReviewFilter(subjectId?: string) {
  return and(
    eq(knowledgeBits.approvalState, "pending"),
    subjectId ? eq(knowledgeSources.subjectId, subjectId) : undefined,
  );
}

export async function countPendingKnowledgeBitsForReview(
  subjectId?: string,
  db: DbExecutor = getDb(),
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(pendingReviewFilter(subjectId));

  return row?.total ?? 0;
}
