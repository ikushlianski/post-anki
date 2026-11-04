import { eq } from "drizzle-orm";
import type { RejectSubjectType } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { knowledgeBitFeedback, knowledgeBits, knowledgeSources } from "../db/schema.js";
import { resolveRejectSubjectType } from "../subject/reject-subject-type.js";

export async function rejectSubjectTypeForBit(bitId: string): Promise<RejectSubjectType | null> {
  const [row] = await getDb()
    .select({ subjectId: knowledgeSources.subjectId })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(eq(knowledgeBits.id, bitId));

  return row ? resolveRejectSubjectType(row.subjectId ?? null) : null;
}

export async function rejectSubjectTypeForFeedback(feedbackId: string): Promise<RejectSubjectType | null> {
  const [row] = await getDb()
    .select({ subjectId: knowledgeBitFeedback.subjectId, sourceSubjectId: knowledgeSources.subjectId })
    .from(knowledgeBitFeedback)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBitFeedback.knowledgeSourceId))
    .where(eq(knowledgeBitFeedback.id, feedbackId));

  return row ? resolveRejectSubjectType(row.subjectId ?? row.sourceSubjectId ?? null) : null;
}
