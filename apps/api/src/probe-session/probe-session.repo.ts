import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  CurriculumStatus,
  DepthLevel,
  ProbeDifficulty,
  ProbeFormat,
  ProbeOutcome,
  ProbeScope,
  ProbeSession,
  ProbeSessionQuestion,
} from "@post-anki/shared";
import { deriveSessionProgress } from "@post-anki/core";
import { getDb } from "../db/client.js";
import {
  curricula,
  modules,
  probeSessionQuestions,
  probeSessions,
  topics,
} from "../db/schema.js";

export type ProbeSessionRow = typeof probeSessions.$inferSelect;
export type ProbeSessionQuestionRow = typeof probeSessionQuestions.$inferSelect;
export type ProbeSessionQuestionInsert = typeof probeSessionQuestions.$inferInsert;

export interface ScopeTopic {
  id: string;
  title: string;
  summary: string | null;
  depth: DepthLevel;
}

export interface ScopeContext {
  scope: ProbeScope;
  scopeId: string;
  curriculumId: string;
  status: CurriculumStatus;
  title: string;
  priorMaturity: number;
  topics: ScopeTopic[];
}

export function rowToSessionQuestion(
  row: ProbeSessionQuestionRow,
): ProbeSessionQuestion {
  return {
    id: row.id,
    order: row.order,
    topicId: row.topicId,
    gapId: row.gapId,
    prompt: row.prompt,
    options: row.options,
    difficulty: row.difficulty as ProbeDifficulty,
    format: row.kind as ProbeFormat,
    answeredIndex: row.answeredIndex,
    outcome: (row.outcome as ProbeOutcome | null) ?? null,
    correctAnswerIndex:
      row.answeredIndex !== null ? row.correctAnswerIndex : null,
  };
}

export async function getActiveSessionRow(
  scope: ProbeScope,
  scopeId: string,
): Promise<ProbeSessionRow | null> {
  const rows = await getDb()
    .select()
    .from(probeSessions)
    .where(
      and(
        eq(probeSessions.scope, scope),
        eq(probeSessions.scopeId, scopeId),
        eq(probeSessions.status, "active"),
      ),
    )
    .orderBy(desc(probeSessions.createdAt));

  return rows[0] ?? null;
}

export async function getSessionRow(
  id: string,
): Promise<ProbeSessionRow | null> {
  const rows = await getDb()
    .select()
    .from(probeSessions)
    .where(eq(probeSessions.id, id));

  return rows[0] ?? null;
}

export async function getQuestionRow(
  questionId: string,
): Promise<ProbeSessionQuestionRow | null> {
  const rows = await getDb()
    .select()
    .from(probeSessionQuestions)
    .where(eq(probeSessionQuestions.id, questionId));

  return rows[0] ?? null;
}

async function listQuestionRows(
  sessionId: string,
): Promise<ProbeSessionQuestionRow[]> {
  return getDb()
    .select()
    .from(probeSessionQuestions)
    .where(eq(probeSessionQuestions.sessionId, sessionId))
    .orderBy(probeSessionQuestions.order);
}

export async function loadSession(id: string): Promise<ProbeSession | null> {
  const row = await getSessionRow(id);

  if (!row) {
    return null;
  }

  const questionRows = await listQuestionRows(id);
  const questions = questionRows.map(rowToSessionQuestion);
  const progress = deriveSessionProgress(questions);

  return {
    id: row.id,
    scope: row.scope as ProbeScope,
    scopeId: row.scopeId,
    curriculumId: row.curriculumId,
    status: progress.status,
    total: progress.total,
    correct: progress.correct,
    answered: progress.answered,
    questions,
  };
}

export async function createSessionWithQuestions(
  session: typeof probeSessions.$inferInsert,
  questions: ProbeSessionQuestionInsert[],
): Promise<ProbeSession | null> {
  const db = getDb();

  await db.insert(probeSessions).values(session);

  if (questions.length > 0) {
    await db.insert(probeSessionQuestions).values(questions);
  }

  return loadSession(session.id);
}

export async function recordAnswer(
  questionId: string,
  selectedIndex: number,
  outcome: ProbeOutcome,
  now: string,
): Promise<void> {
  await getDb()
    .update(probeSessionQuestions)
    .set({
      answeredIndex: selectedIndex,
      outcome,
      answeredAt: new Date(now),
    })
    .where(eq(probeSessionQuestions.id, questionId));
}

export async function syncSessionCounters(
  sessionId: string,
  now: string,
): Promise<{ correct: number; answered: number; total: number; status: string }> {
  const questionRows = await listQuestionRows(sessionId);
  const progress = deriveSessionProgress(questionRows.map(rowToSessionQuestion));

  await getDb()
    .update(probeSessions)
    .set({
      total: progress.total,
      correct: progress.correct,
      answered: progress.answered,
      status: progress.status,
      completedAt: progress.status === "completed" ? new Date(now) : null,
    })
    .where(eq(probeSessions.id, sessionId));

  return progress;
}

export async function deleteSessionsForScope(
  scope: ProbeScope,
  scopeId: string,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: probeSessions.id })
    .from(probeSessions)
    .where(
      and(eq(probeSessions.scope, scope), eq(probeSessions.scopeId, scopeId)),
    );

  const ids = rows.map((r) => r.id);

  if (ids.length === 0) {
    return;
  }

  await db
    .delete(probeSessionQuestions)
    .where(inArray(probeSessionQuestions.sessionId, ids));
  await db.delete(probeSessions).where(inArray(probeSessions.id, ids));
}

export async function getScopeContext(
  scope: ProbeScope,
  scopeId: string,
): Promise<ScopeContext | null> {
  const db = getDb();

  if (scope === "topic") {
    const topicRow = (
      await db.select().from(topics).where(eq(topics.id, scopeId))
    )[0];

    if (!topicRow) {
      return null;
    }

    const curriculumRow = (
      await db
        .select()
        .from(curricula)
        .where(eq(curricula.id, topicRow.curriculumId))
    )[0];

    if (!curriculumRow) {
      return null;
    }

    return {
      scope,
      scopeId,
      curriculumId: topicRow.curriculumId,
      status: curriculumRow.status as CurriculumStatus,
      title: topicRow.title,
      priorMaturity: topicRow.progressMaturity,
      topics: [
        {
          id: topicRow.id,
          title: topicRow.title,
          summary: topicRow.summary,
          depth: topicRow.depth as DepthLevel,
        },
      ],
    };
  }

  const moduleRow = (
    await db.select().from(modules).where(eq(modules.id, scopeId))
  )[0];

  if (!moduleRow) {
    return null;
  }

  const curriculumRow = (
    await db
      .select()
      .from(curricula)
      .where(eq(curricula.id, moduleRow.curriculumId))
  )[0];

  if (!curriculumRow) {
    return null;
  }

  const topicRows = await db
    .select()
    .from(topics)
    .where(and(eq(topics.moduleId, scopeId), eq(topics.included, true)))
    .orderBy(topics.order);

  const priorMaturity =
    topicRows.length === 0
      ? 0
      : Math.round(
          topicRows.reduce((sum, t) => sum + t.progressMaturity, 0) /
            topicRows.length,
        );

  return {
    scope,
    scopeId,
    curriculumId: moduleRow.curriculumId,
    status: curriculumRow.status as CurriculumStatus,
    title: moduleRow.title,
    priorMaturity,
    topics: topicRows.map((t) => ({
      id: t.id,
      title: t.title,
      summary: t.summary,
      depth: t.depth as DepthLevel,
    })),
  };
}
