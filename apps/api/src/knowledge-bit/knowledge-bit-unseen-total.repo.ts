import { and, count, eq, exists, gt, isNull, not } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitQuestionVariants,
  knowledgeBitReviews,
  knowledgeBitSchedules,
  knowledgeBits,
} from "../db/schema.js";

export async function countUnseenApprovedKnowledgeBits(db: DbExecutor = getDb()): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(knowledgeBits)
    .where(
      and(
        eq(knowledgeBits.approvalState, "approved"),
        exists(
          db
            .select({ one: knowledgeBitQuestionVariants.id })
            .from(knowledgeBitQuestionVariants)
            .where(
              and(
                eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
                isNull(knowledgeBitQuestionVariants.supersededAt),
              ),
            ),
        ),
        not(
          exists(
            db
              .select({ one: knowledgeBitSchedules.knowledgeBitId })
              .from(knowledgeBitSchedules)
              .where(
                and(
                  eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id),
                  gt(knowledgeBitSchedules.reviewCount, 0),
                ),
              ),
          ),
        ),
        not(
          exists(
            db
              .select({ one: knowledgeBitReviews.id })
              .from(knowledgeBitReviews)
              .where(eq(knowledgeBitReviews.knowledgeBitId, knowledgeBits.id)),
          ),
        ),
      ),
    );

  return row?.total ?? 0;
}
