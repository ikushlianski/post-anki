import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  curricula,
  knowledgeBitNoteSchedules,
  knowledgeBits,
  knowledgeSources,
  topics,
} from "../db/schema.js";
import { effectiveSubjectIdSql } from "../knowledge-bit/knowledge-bit-subject.js";

export async function listCardRowsByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  return getDb()
    .select({
      id: knowledgeBits.id,
      approvalState: knowledgeBits.approvalState,
      subjectId: effectiveSubjectIdSql,
      sourceId: knowledgeSources.id,
      sourceSummary: knowledgeSources.summary,
      sourceRawText: knowledgeSources.rawText,
      sourceUrl: knowledgeSources.sourceUrl,
      scheduled: knowledgeBitNoteSchedules.knowledgeBitId,
      phase: knowledgeBitNoteSchedules.phase,
      dueAt: knowledgeBitNoteSchedules.dueAt,
      intervalDays: knowledgeBitNoteSchedules.intervalDays,
      lapses: knowledgeBitNoteSchedules.lapses,
      reviewCount: knowledgeBitNoteSchedules.reviewCount,
      lastReviewedAt: knowledgeBitNoteSchedules.lastReviewedAt,
      suspendedAt: knowledgeBitNoteSchedules.suspendedAt,
      buriedUntil: knowledgeBitNoteSchedules.buriedUntil,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeBitNoteSchedules, eq(knowledgeBitNoteSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(inArray(knowledgeBits.id, ids));
}
