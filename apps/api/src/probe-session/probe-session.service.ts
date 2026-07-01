import type {
  AnswerProbeSessionInput,
  AnswerProbeSessionResult,
  PrepareProbeSessionInput,
  ProbeOutcome,
  ProbeScope,
  ProbeSession,
  ProbeSessionStatus,
} from "@post-anki/shared";
import {
  deriveQuizOutcome,
  openGaps,
  progressFromGaps,
} from "@post-anki/core";
import { newId } from "../shared/id.js";
import { listGapsForTopic, persistGaps } from "../gap/gap.repo.js";
import {
  getTopicRow,
  rowDepth,
  writeTopicProgress,
} from "../topic/topic-progress.repo.js";
import {
  createSessionWithQuestions,
  deleteSessionsForScope,
  getActiveSessionRow,
  getQuestionRow,
  getScopeContext,
  getSessionRow,
  loadSession,
  recordAnswer,
  syncSessionCounters,
} from "./probe-session.repo.js";
import { generateProbeBatch } from "./probe-session.generate.js";
import { buildQuestionRows } from "./probe-session.map.js";

export type ProbeSessionError =
  | "not_found"
  | "not_confirmed"
  | "generation_failed"
  | "question_not_found";

export async function prepareProbeSession(
  input: PrepareProbeSessionInput,
  now: string,
): Promise<ProbeSession | { error: ProbeSessionError }> {
  const ctx = await getScopeContext(input.scope, input.scopeId);

  if (!ctx) {
    return { error: "not_found" };
  }

  if (ctx.status !== "confirmed") {
    return { error: "not_confirmed" };
  }

  if (input.regenerate) {
    await deleteSessionsForScope(input.scope, input.scopeId);
  } else {
    const active = await getActiveSessionRow(input.scope, input.scopeId);

    if (active) {
      const existing = await loadSession(active.id);

      if (existing) {
        return existing;
      }
    }
  }

  const batch = await generateProbeBatch(input.scope, ctx);

  if (batch.questions.length === 0) {
    return { error: "generation_failed" };
  }

  const sessionId = newId("psess");
  const rows = buildQuestionRows({
    sessionId,
    generated: batch.questions,
    defaultTopicId: ctx.topics[0]?.id ?? "",
    topicIdByTitle: batch.topicIdByTitle,
    gapIdByKey: batch.gapIdByKey,
    makeId: () => newId("psq"),
  });

  const created = await createSessionWithQuestions(
    {
      id: sessionId,
      scope: input.scope,
      scopeId: input.scopeId,
      curriculumId: ctx.curriculumId,
      status: "active",
      total: rows.length,
      correct: 0,
      answered: 0,
      createdAt: new Date(now),
      completedAt: null,
    },
    rows,
  );

  return created ?? { error: "not_found" };
}

export async function getActiveProbeSession(
  scope: ProbeScope,
  scopeId: string,
): Promise<ProbeSession | null> {
  const active = await getActiveSessionRow(scope, scopeId);

  if (!active) {
    return null;
  }

  return loadSession(active.id);
}

export async function answerProbeSession(
  input: AnswerProbeSessionInput,
  now: string,
): Promise<AnswerProbeSessionResult | { error: ProbeSessionError }> {
  const session = await getSessionRow(input.sessionId);

  if (!session) {
    return { error: "not_found" };
  }

  const question = await getQuestionRow(input.questionId);

  if (!question || question.sessionId !== input.sessionId) {
    return { error: "question_not_found" };
  }

  let outcome: ProbeOutcome;

  if (question.answeredIndex !== null) {
    outcome =
      (question.outcome as ProbeOutcome | null) ??
      deriveQuizOutcome(question.answeredIndex, question.correctAnswerIndex);
  } else {
    outcome = deriveQuizOutcome(input.selectedIndex, question.correctAnswerIndex);
    await recordAnswer(input.questionId, input.selectedIndex, outcome, now);
  }

  let coveredGapLabels: string[] = [];

  if (question.topicId) {
    if (outcome === "pass" && question.gapId) {
      const gaps = await listGapsForTopic(question.topicId);
      const gap = gaps.find((g) => g.id === question.gapId);

      if (gap && gap.state === "open") {
        await persistGaps([{ ...gap, state: "covered", lastEvaluatedAt: now }]);
        coveredGapLabels = [gap.label];
      }
    }

    await refreshTopicProgress(question.topicId, now);
  }

  const progress = await syncSessionCounters(input.sessionId, now);

  return {
    questionId: input.questionId,
    outcome,
    correctAnswerIndex: question.correctAnswerIndex,
    correct: progress.correct,
    answered: progress.answered,
    total: progress.total,
    status: progress.status as ProbeSessionStatus,
    coveredGapLabels,
  };
}

async function refreshTopicProgress(
  topicId: string,
  now: string,
): Promise<void> {
  const topicRow = await getTopicRow(topicId);

  if (!topicRow) {
    return;
  }

  const gaps = await listGapsForTopic(topicId);
  const attempts = Math.max(topicRow.progressAttempts, 1);
  const progress = progressFromGaps(gaps, rowDepth(topicRow), attempts, now);
  const remaining = openGaps(gaps, rowDepth(topicRow));
  const learningStatus = remaining.length === 0 ? "reviewing" : "probing";

  await writeTopicProgress(topicId, progress, learningStatus);
}
