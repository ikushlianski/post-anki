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
  deriveMultiQuizOutcome,
  deriveQuizOutcome,
  electDepthFromCalibration,
  hasEarlyMasterySignal,
  isOneShotProbeScope,
  openGaps,
  progressFromGaps,
  randomPermutation,
  shouldReplenish,
} from "@post-anki/core";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { recordActivityToday } from "../streak/streak.service.js";
import { listGapsForTopic } from "../gap/gap.repo.js";
import { applyGapMasteryAttempt } from "../gap/gap-mastery.repo.js";
import { recordAnswerActivityForTopic } from "../liveness/answer-activity.js";
import {
  getTopicRow,
  rowDepth,
  writeTopicProgress,
} from "../topic/topic-progress.repo.js";
import { electTopicDepths } from "../topic/topic.repo.js";
import {
  appendQuestions,
  createSessionWithQuestions,
  deleteSessionsForScope,
  getActiveSessionRow,
  getQuestionRow,
  getScopeContext,
  getSessionRow,
  listAnsweredTopicOutcomesForSession,
  loadSession,
  recordAnswer,
  releaseReplenish,
  syncSessionCounters,
  tryClaimReplenish,
  type ProbeSessionQuestionRow,
  type ProbeSessionRow,
} from "./probe-session.repo.js";
import { generateProbeBatch, generateReplenishBatch } from "./probe-session.generate.js";
import { buildQuestionRows } from "./probe-session.map.js";

// Kept equal to the initial batch's own MIN_TOTAL floor
// (probe-session.generate.ts) — SCENARIO 17's invariant is "at least 10
// ready", the same number both sides of this app already agree is a
// sensible minimum viable batch.
const REPLENISH_FLOOR = 10;

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

  const batch = await generateProbeBatch(
    input.scope,
    ctx,
    input.allowMultiSelect ?? false,
  );

  if (batch.questions.length === 0) {
    return { error: "generation_failed" };
  }

  const sessionId = newId("psess");
  const rows = buildQuestionRows({
    sessionId,
    generated: batch.questions,
    defaultTopicId: batch.defaultTopicId,
    topicIdByTitle: batch.topicIdByTitle,
    gapIdByKey: batch.gapIdByKey,
    makeId: () => newId("psq"),
    allowMultiSelect: input.allowMultiSelect ?? false,
    makePermutation: randomPermutation,
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

  const isMulti = question.type === "multi";
  // Only a genuinely fresh answer feeds the gap-mastery machine — a replay
  // of an already-answered question (the same idempotency case the old
  // single-verdict logic handled via `gap.state === "open"`) must never
  // re-count toward masteryStage.
  const isFreshAnswer = question.answeredIndex === null;

  let outcome: ProbeOutcome;

  if (!isFreshAnswer) {
    outcome = (question.outcome as ProbeOutcome | null) ?? computeOutcome(question, input);
  } else {
    outcome = computeOutcome(question, input);

    const selectedIndices = isMulti ? (input.selectedIndices ?? []) : null;
    const selectedIndex = isMulti
      ? (selectedIndices!.length > 0 ? Math.min(...selectedIndices!) : -1)
      : (input.selectedIndex ?? -1);

    await recordAnswer(
      input.questionId,
      { selectedIndex, selectedIndices },
      outcome,
      now,
    );
  }

  let coveredGapLabels: string[] = [];
  let gapMastery: AnswerProbeSessionResult["gapMastery"] = null;

  if (question.topicId) {
    if (isFreshAnswer && (question.gapId || question.gapLabel)) {
      const topicRow = await getTopicRow(question.topicId);
      const topicDepth = topicRow ? rowDepth(topicRow) : "working";

      const attempt = await applyGapMasteryAttempt({
        topicId: question.topicId,
        topicDepth,
        gapId: question.gapId,
        gapLabel: question.gapLabel,
        currentProbeSessionId: session.id,
        correct: outcome === "pass",
        now,
      });

      if (attempt) {
        const topicGaps = await listGapsForTopic(question.topicId);
        const gapRow = topicGaps.find((g) => g.id === attempt.gapId);
        const label = gapRow?.label ?? question.gapLabel ?? "";

        gapMastery = {
          gapId: attempt.gapId,
          label,
          status: attempt.masteryStatus,
          masteryStage: attempt.masteryStage,
          justMastered: attempt.justMastered,
        };

        if (attempt.justMastered) {
          coveredGapLabels = [label];
        }
      }
    }

    await refreshTopicProgress(question.topicId, now);

    if (isFreshAnswer) {
      await recordAnswerActivityForTopic(question.topicId, now);
    }
  }

  const progress = await syncSessionCounters(input.sessionId, now);

  // S5 — a curriculum-scope calibration quiz's completion is the first real
  // writer of topics.depth/depthElectedAt. Guarded on session.completedAt
  // (the pre-answer row fetched above) being null so this only fires once,
  // the moment the quiz crosses from active to completed — never on a
  // later answer replay against an already-completed session.
  if (session.scope === "curriculum" && session.completedAt === null && progress.status === "completed") {
    void electDepthsOnCalibrationCompletion(input.sessionId, now).catch((err) => {
      log.error({ err, sessionId: input.sessionId }, "calibration_depth_election_failed");
    });
  }

  await recordActivityToday(now);

  // Fire-and-forget, same pattern the curriculum orchestrator already uses
  // for research: the learner keeps answering the questions already loaded
  // (SCENARIO 18) while this runs. `tryClaimReplenish` inside is what
  // guarantees only one of these is ever actually in flight per session
  // (SCENARIO 20), even if two answers cross the floor in quick succession.
  void maybeReplenish(session, progress).catch((err) => {
    log.error({ err, sessionId: session.id }, "probe_session_replenish_failed");
  });

  return {
    questionId: input.questionId,
    outcome,
    correctAnswerIndex: question.correctAnswerIndex,
    correctAnswerIndexes: isMulti ? (question.correctAnswerIndexes ?? null) : null,
    correct: progress.correct,
    answered: progress.answered,
    total: progress.total,
    status: progress.status as ProbeSessionStatus,
    coveredGapLabels,
    optionExplanations: question.optionExplanations ?? null,
    gapMastery,
  };
}

/**
 * Elects each topic's starting depth from this curriculum-scope calibration
 * session's per-topic answer record (S5), then writes it via
 * electTopicDepths — topics.depth/depthElectedAt's first real writer.
 * Fire-and-forget from answerProbeSession, same pattern as maybeReplenish:
 * the learner sees their last answer's result immediately, this write
 * trails a beat behind.
 */
async function electDepthsOnCalibrationCompletion(sessionId: string, now: string): Promise<void> {
  const outcomes = await listAnsweredTopicOutcomesForSession(sessionId);

  if (outcomes.length === 0) {
    return;
  }

  const elected = electDepthFromCalibration(outcomes);

  await electTopicDepths(elected, now);
}

/**
 * Checks the replenish threshold and, if crossed and no replenish is
 * already running for this session, generates and appends a top-up batch in
 * the background. Safe to call after every answer — `tryClaimReplenish`'s
 * atomic guard means only the first caller past the threshold actually does
 * anything; every later answer while a top-up is in flight is a no-op here.
 */
async function maybeReplenish(
  session: ProbeSessionRow,
  progress: { total: number; answered: number; correct: number },
): Promise<void> {
  // A curriculum-wide calibration probe is a single one-shot batch (per its
  // own spec) — it must never grow mid-session the way an ongoing topic/
  // module/tag practice queue does.
  if (isOneShotProbeScope(session.scope as ProbeScope)) {
    return;
  }

  // Issue #96 — a learner who has clearly already demonstrated mastery
  // (strong, early, consistent accuracy) stops triggering further
  // generation, for topic, module, and tag scope alike. Composed as a
  // second, separate early-return above shouldReplenish's own floor check,
  // not folded into it — shouldReplenish is a generic "remaining below
  // floor" check reused as-is by the client's own mirror.
  if (hasEarlyMasterySignal(progress.correct, progress.answered)) {
    return;
  }

  if (!shouldReplenish(progress.total, progress.answered, REPLENISH_FLOOR)) {
    return;
  }

  const claimed = await tryClaimReplenish(session.id);

  if (!claimed) {
    return;
  }

  const orderOffset = progress.total;

  try {
    const scope = session.scope as ProbeScope;
    const ctx = await getScopeContext(scope, session.scopeId);

    if (!ctx) {
      return;
    }

    // The per-session multi-select setting isn't persisted on the session
    // row — infer it from whether any question already loaded for this
    // session is a "multi" type. The bot never requests multi-select
    // (SCENARIO 20's guard aside, its inline-keyboard flow can't submit
    // more than one selected index at a time), so a bot-only session will
    // always infer false here; the web quiz always requests true, so a web
    // session's replenish batch stays consistent with its own first batch.
    const existing = await loadSession(session.id);
    const allowMultiSelect = existing?.questions.some((q) => q.type === "multi") ?? false;

    const batch = await generateReplenishBatch(scope, ctx, allowMultiSelect);

    if (batch.questions.length > 0) {
      const rows = buildQuestionRows({
        sessionId: session.id,
        generated: batch.questions,
        defaultTopicId: batch.defaultTopicId,
        topicIdByTitle: batch.topicIdByTitle,
        gapIdByKey: batch.gapIdByKey,
        makeId: () => newId("psq"),
        allowMultiSelect,
        makePermutation: randomPermutation,
        orderOffset,
      });

      await appendQuestions(rows);
      await syncSessionCounters(session.id, new Date().toISOString());
    }
  } catch (err) {
    log.error({ err, sessionId: session.id }, "probe_session_replenish_failed");
  } finally {
    // Degrade-gracefully posture matching the existing initial-batch
    // generation_failed handling (architecture.md's Failure modes): the
    // session simply doesn't grow this time, but the guard always clears so
    // a later answer can retry.
    await releaseReplenish(session.id);
  }
}

function computeOutcome(
  question: ProbeSessionQuestionRow,
  input: AnswerProbeSessionInput,
): ProbeOutcome {
  if (question.type === "multi") {
    const selected =
      question.answeredIndex !== null
        ? (question.answeredIndexes ?? [])
        : (input.selectedIndices ?? []);

    return deriveMultiQuizOutcome(selected, question.correctAnswerIndexes ?? []);
  }

  const selected =
    question.answeredIndex !== null ? question.answeredIndex : (input.selectedIndex ?? -1);

  return deriveQuizOutcome(selected, question.correctAnswerIndex);
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
