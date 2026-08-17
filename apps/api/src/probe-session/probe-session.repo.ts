import { and, desc, eq, inArray, or } from "drizzle-orm";
import type {
  CurriculumStatus,
  DepthLevel,
  ProbeDifficulty,
  ProbeFormat,
  ProbeOutcome,
  ProbeQuestionType,
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
import { getTag, listTopicsForTag } from "../tag/tag.repo.js";
import { listDormantEntityIds } from "../liveness/liveness.repo.js";

export type ProbeSessionRow = typeof probeSessions.$inferSelect;
export type ProbeSessionQuestionRow = typeof probeSessionQuestions.$inferSelect;
export type ProbeSessionQuestionInsert = typeof probeSessionQuestions.$inferInsert;

export interface ScopeTopic {
  id: string;
  title: string;
  summary: string | null;
  depth: DepthLevel;
  curriculumId: string;
}

export interface ScopeContext {
  scope: ProbeScope;
  scopeId: string;
  // Only ever null for scope "tag" — a cross-cutting session has no single
  // owning curriculum, since its topics can span several. Every ScopeTopic
  // still carries its own curriculumId (below), which is what grounding
  // and citation lookups actually key off.
  curriculumId: string | null;
  status: CurriculumStatus;
  title: string;
  priorMaturity: number;
  topics: ScopeTopic[];
}

export function rowToSessionQuestion(
  row: ProbeSessionQuestionRow,
): ProbeSessionQuestion {
  const answered = row.answeredIndex !== null;

  return {
    id: row.id,
    order: row.order,
    topicId: row.topicId,
    gapId: row.gapId,
    prompt: row.prompt,
    options: row.options,
    difficulty: row.difficulty as ProbeDifficulty,
    format: row.kind as ProbeFormat,
    type: row.type as ProbeQuestionType,
    answeredIndex: row.answeredIndex,
    answeredIndexes: row.answeredIndexes ?? null,
    outcome: (row.outcome as ProbeOutcome | null) ?? null,
    correctAnswerIndex: answered ? row.correctAnswerIndex : null,
    correctAnswerIndexes: answered ? (row.correctAnswerIndexes ?? null) : null,
    optionExplanations: row.outcome !== null ? (row.optionExplanations ?? null) : null,
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
        // A session's `status` is derived purely from its currently-persisted
        // question rows (deriveSessionProgress) and can read "completed" for
        // the moment between the learner's last loaded answer and a
        // still-in-flight replenish appending more rows (SCENARIO 17/18) —
        // `replenishing` is the signal that more questions are genuinely on
        // the way, so a session in that state must still count as "active"
        // for lookup purposes, or the client's/bot's refetch-on-low would
        // find nothing and wrongly conclude the quiz vanished.
        or(eq(probeSessions.status, "active"), eq(probeSessions.replenishing, true)),
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

export async function appendQuestions(
  questions: ProbeSessionQuestionInsert[],
): Promise<void> {
  if (questions.length === 0) {
    return;
  }

  await getDb().insert(probeSessionQuestions).values(questions);
}

/**
 * Atomically claims the replenish lock for a session: flips `replenishing`
 * from false to true and reports whether *this* call is the one that made
 * the flip (`true`) or the lock was already held by another in-flight
 * replenish (`false`). The `WHERE replenishing = false` clause is what makes
 * this safe under two answers landing in quick succession (SCENARIO 20) —
 * a read-then-write check in application code would race, but Postgres
 * evaluates the WHERE clause and the UPDATE as a single atomic step per row.
 */
export async function tryClaimReplenish(sessionId: string): Promise<boolean> {
  const rows = await getDb()
    .update(probeSessions)
    .set({ replenishing: true })
    .where(and(eq(probeSessions.id, sessionId), eq(probeSessions.replenishing, false)))
    .returning({ id: probeSessions.id });

  return rows.length > 0;
}

export async function releaseReplenish(sessionId: string): Promise<void> {
  await getDb()
    .update(probeSessions)
    .set({ replenishing: false })
    .where(eq(probeSessions.id, sessionId));
}

export async function recordAnswer(
  questionId: string,
  selection: { selectedIndex: number; selectedIndices: number[] | null },
  outcome: ProbeOutcome,
  now: string,
): Promise<void> {
  await getDb()
    .update(probeSessionQuestions)
    .set({
      answeredIndex: selection.selectedIndex,
      answeredIndexes: selection.selectedIndices,
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
          curriculumId: topicRow.curriculumId,
        },
      ],
    };
  }

  if (scope === "tag") {
    return getTagScopeContext(scopeId);
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
      curriculumId: t.curriculumId,
    })),
  };
}

/**
 * A tag-scoped session's topic set is the union of directly tag-assigned
 * topics and every included topic under a tag-assigned module, spanning as
 * many curricula as the tag touches (SCENARIO 14). Only topics belonging to
 * a `confirmed` curriculum are eligible — `prepareProbeSession` hard-guards
 * `ctx.status !== "confirmed"`, and a tag has no single curriculum status of
 * its own to report, so this synthesizes "confirmed" once at least one
 * eligible topic exists, mirroring what a real confirmed curriculum would
 * report for module/topic scope.
 */
async function getTagScopeContext(tagId: string): Promise<ScopeContext | null> {
  const db = getDb();
  const tag = await getTag(tagId);

  if (!tag) {
    return null;
  }

  const topicRows = await listTopicsForTag(tagId);

  if (topicRows.length === 0) {
    return null;
  }

  const curriculumIds = Array.from(new Set(topicRows.map((t) => t.curriculumId)));
  const [curriculumRows, dormantCurriculumIds] = await Promise.all([
    db.select().from(curricula).where(inArray(curricula.id, curriculumIds)),
    listDormantEntityIds("curriculum"),
  ]);
  const confirmedIds = new Set(
    curriculumRows
      .filter((c) => c.status === "confirmed" && !dormantCurriculumIds.has(c.id))
      .map((c) => c.id),
  );

  const eligibleTopics = topicRows.filter((t) => confirmedIds.has(t.curriculumId));

  if (eligibleTopics.length === 0) {
    return null;
  }

  const topicIds = eligibleTopics.map((t) => t.id);
  const topicProgressRows = await db
    .select({ progressMaturity: topics.progressMaturity })
    .from(topics)
    .where(inArray(topics.id, topicIds));

  const priorMaturity =
    topicProgressRows.length === 0
      ? 0
      : Math.round(
          topicProgressRows.reduce((sum, t) => sum + t.progressMaturity, 0) /
            topicProgressRows.length,
        );

  return {
    scope: "tag",
    scopeId: tagId,
    curriculumId: null,
    status: "confirmed",
    title: tag.name,
    priorMaturity,
    topics: eligibleTopics.map((t) => ({
      id: t.id,
      title: t.title,
      summary: t.summary,
      depth: t.depth as DepthLevel,
      curriculumId: t.curriculumId,
    })),
  };
}
