import { and, count, eq, exists, isNull } from "drizzle-orm";
import { subjectPathLabel, type PendingReviewSubjectCount } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources, subjects } from "../db/schema.js";

export async function listPendingReviewSubjectCounts(
  db: DbExecutor = getDb(),
): Promise<PendingReviewSubjectCount[]> {
  const counts = await db
    .select({ subjectId: knowledgeSources.subjectId, pendingCount: count() })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        eq(knowledgeBits.approvalState, "pending"),
        isNull(knowledgeSources.processedAt),
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
      ),
    )
    .groupBy(knowledgeSources.subjectId);

  if (counts.length === 0) {
    return [];
  }

  const all = await db
    .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId })
    .from(subjects);
  const byId = new Map(all.map((row) => [row.id, row]));

  return counts.flatMap((row) => {
    const subject = row.subjectId ? byId.get(row.subjectId) : undefined;

    if (!subject || row.pendingCount < 1) {
      return [];
    }

    return [
      {
        subjectId: subject.id,
        name: subject.name,
        path: subjectPathLabel(subject.id, byId),
        pendingCount: row.pendingCount,
      },
    ];
  }).sort((a, b) => a.path.localeCompare(b.path));
}
