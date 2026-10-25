import { and, asc, desc, eq, exists, inArray, isNull } from "drizzle-orm";
import { collectSubjectSubtreeIds } from "@post-anki/core";
import type { KnowledgeBitOverviewPage, KnowledgeBitOverviewQuery } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  subjects,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { deriveOverviewState } from "./knowledge-bit-overview-state.js";
import { pickPreferredVariants } from "./knowledge-bit-preferred-variant.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";
import { containsPattern, questionOrAnswerContains } from "./knowledge-bit-text-match.js";

async function resolveSubjectScopeIds(subjectId: string, db: DbExecutor): Promise<string[]> {
  const rows = await db
    .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId })
    .from(subjects);

  return collectSubjectSubtreeIds(subjectId, rows);
}

// Approved bits with a live question, newest first. Subject filter includes descendants.
export async function listKnowledgeBitOverview(
  { subjectId, q, limit, offset }: KnowledgeBitOverviewQuery,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitOverviewPage> {
  const scopeIds = subjectId ? await resolveSubjectScopeIds(subjectId, db) : null;
  const pattern = q ? containsPattern(q) : null;

  const rows = await db
    .select({
      id: knowledgeBits.id,
      subjectId: effectiveSubjectIdSql,
      phase: knowledgeBitSchedules.phase,
      scheduled: knowledgeBitSchedules.knowledgeBitId,
      dueAt: knowledgeBitSchedules.dueAt,
      suspendedAt: knowledgeBitSchedules.suspendedAt,
      buriedUntil: knowledgeBitSchedules.buriedUntil,
      lapses: knowledgeBitSchedules.lapses,
      sourceLinks: knowledgeBits.sourceLinks,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(
      and(
        bitApproved,
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
        scopeIds ? inArray(effectiveSubjectIdSql, scopeIds) : undefined,
        pattern ? questionOrAnswerContains(pattern, db) : undefined,
      ),
    )
    .orderBy(desc(knowledgeBits.createdAt), asc(knowledgeBits.id))
    .limit(limit + 1)
    .offset(offset);

  const pageRows = rows.slice(0, limit);

  if (pageRows.length === 0) {
    return { items: [], hasMore: false };
  }

  const variantRows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      createdAt: knowledgeBitQuestionVariants.createdAt,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(
          knowledgeBitQuestionVariants.knowledgeBitId,
          pageRows.map((row) => row.id),
        ),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );

  const variants = pickPreferredVariants(variantRows);

  const items = pageRows.flatMap((row) => {
    const variant = variants.get(row.id);

    if (!variant) {
      return [];
    }

    const schedule = row.scheduled ? row : null;

    return [
      {
        knowledgeBitId: row.id,
        question: variant.prompt,
        answer: variant.answer,
        subjectId: row.subjectId,
        state: deriveOverviewState(
          schedule && { phase: schedule.phase ?? "review", suspendedAt: schedule.suspendedAt, buriedUntil: schedule.buriedUntil },
          now,
        ),
        dueAt: schedule?.dueAt?.toISOString() ?? null,
        lapses: schedule?.lapses ?? 0,
        sourceLinks: row.sourceLinks ?? [],
      },
    ];
  });

  return { items, hasMore: rows.length > limit };
}
