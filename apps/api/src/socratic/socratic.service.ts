import type {
  AnswerSocraticInput,
  AnswerSocraticResult,
  CheckSessionIdleResult,
  CompleteSocraticSessionResult,
  Gap,
  SocraticAction,
  SocraticEval,
  SocraticSession,
  SocraticSessionSummary,
  StartSocraticSessionInput,
} from "@post-anki/shared";
import { socraticEvalSchema } from "@post-anki/shared";
import {
  countPriorWrong,
  deriveSocraticAction,
  gapMaturity,
  hasPriorPartial,
  inScopeGaps,
  isBlankAnswer,
  nextGapToProbe,
  progressFromGaps,
} from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { recordActivityToday } from "../streak/streak.service.js";
import { listGapsForTopic, persistGaps } from "../gap/gap.repo.js";
import {
  getTopicRow,
  rowDepth,
  writeTopicProgress,
  type TopicRow,
} from "../topic/topic-progress.repo.js";
import { getCurriculumContextForTopic } from "../curriculum/curriculum.repo.js";
import { gatherProbeGrounding } from "../probe/probe-grounding.js";
import { recordAnswerActivity } from "../liveness/answer-activity.js";
import { buildProbeQuestionForGap, isSocraticGatedByCalibration } from "../probe/probe.service.js";
import {
  completeSocraticSession,
  createSocraticSession,
  getActiveSocraticSessionRow,
  getSocraticSessionRow,
  getTurnRow,
  insertTurn,
  listTurnRows,
  markCheckpointShown,
  pendingTurn,
  recordTurnAnswer,
  type SocraticSessionRow,
  type SocraticTurnRow,
} from "./socratic.repo.js";
import { rowToTurn } from "./socratic.map.js";
import {
  buildSessionSummary,
  lastActivityAt,
  SESSION_IDLE_THRESHOLD_MS,
} from "./session-summary.js";

export type SocraticError =
  | "not_found"
  | "not_confirmed"
  | "turn_not_found"
  | "calibration_required";

// Soft checkpoint at 5+ exchanges (issue #27) — the literal number from the
// issue itself, no per-depth scaling.
const SOFT_CHECKPOINT_THRESHOLD = 5;

export async function startSocraticSession(
  input: StartSocraticSessionInput,
  now: string,
): Promise<SocraticSession | { error: SocraticError }> {
  const topicRow = await getTopicRow(input.topicId);

  if (!topicRow) {
    return { error: "not_found" };
  }

  const ctx = await getCurriculumContextForTopic(input.topicId);

  if (!ctx || ctx.status !== "confirmed") {
    return { error: "not_confirmed" };
  }

  if (await isSocraticGatedByCalibration(input.topicId)) {
    return { error: "calibration_required" };
  }

  if (!input.regenerate) {
    const active = await getActiveSocraticSessionRow(input.topicId);

    if (active) {
      const pending = await pendingTurn(active.id);

      if (pending) {
        return sessionDto(active, "active", pending);
      }

      const created = await openNextConcept(active.id, topicRow, now);

      if (created) {
        return sessionDto(active, "active", created);
      }

      await completeSocraticSession(active.id, now);

      return sessionDto(active, "completed", null);
    }
  } else {
    const active = await getActiveSocraticSessionRow(input.topicId);

    if (active) {
      await completeSocraticSession(active.id, now);
    }
  }

  const sessionId = newId("ssess");

  await createSocraticSession({
    id: sessionId,
    topicId: input.topicId,
    curriculumId: ctx.curriculumId,
    status: "active",
    createdAt: new Date(now),
    completedAt: null,
  });

  const sessionRow = await getSocraticSessionRow(sessionId);
  const created = await openNextConcept(sessionId, topicRow, now);

  if (!created) {
    await completeSocraticSession(sessionId, now);

    return sessionDto(sessionRow!, "completed", null);
  }

  return sessionDto(sessionRow!, "active", created);
}

export async function answerSocraticSession(
  input: AnswerSocraticInput,
  now: string,
): Promise<AnswerSocraticResult | { error: SocraticError }> {
  const session = await getSocraticSessionRow(input.sessionId);

  if (!session) {
    return { error: "not_found" };
  }

  const turn = await getTurnRow(input.turnId);

  if (!turn || turn.sessionId !== input.sessionId) {
    return { error: "turn_not_found" };
  }

  const topicRow = await getTopicRow(session.topicId);

  if (!topicRow) {
    return { error: "not_found" };
  }

  if (isBlankAnswer(input.answer)) {
    return retryResult(topicRow, turn);
  }

  const depth = rowDepth(topicRow);
  const gaps = await listGapsForTopic(session.topicId);
  const gap = turn.gapId ? gaps.find((g) => g.id === turn.gapId) ?? null : null;

  const grounding = (
    await gatherProbeGrounding(
      session.curriculumId,
      topicRow.title,
      turn.conceptLabel,
    )
  ).text;

  const evaluation = await evaluateSocratic(
    topicRow.title,
    turn.conceptLabel,
    input.answer,
    grounding,
    session.curriculumId,
  );

  const priorTurns = await listTurnRows(session.id);
  const priorWrong = countPriorWrong(priorTurns, turn.gapId);
  const priorEverPartial = hasPriorPartial(priorTurns, turn.gapId);
  const action = deriveSocraticAction({
    degree: evaluation.degree,
    priorWrongCount: priorWrong,
    priorEverPartial,
    depth,
  });

  await recordTurnAnswer(turn.id, input.answer, evaluation.degree, action, now);

  const covered =
    action === "advance" || action === "give_answer" || action === "move_on";

  if (covered && gap && gap.state === "open") {
    await persistGaps([{ ...gap, state: "covered", lastEvaluatedAt: now }]);
  }

  await refreshTopicProgress(topicRow, now);
  await recordAnswerActivity(session.curriculumId, now);

  let next: SocraticTurnRow | null = null;
  let status: "active" | "completed" = "active";

  if (covered) {
    next = await openNextConcept(session.id, topicRow, now);

    if (!next) {
      await completeSocraticSession(session.id, now);
      status = "completed";
    }
  } else if (gap) {
    next = await makeTurnForGap(session.id, topicRow, gap, now);
  }

  const after = await listGapsForTopic(session.topicId);
  const inScope = inScopeGaps(after, depth);

  await recordActivityToday(now);

  // Soft checkpoint (issue #27, spec.md Decision 2) — counted LIVE from the
  // answered-turn count, computed AFTER recordTurnAnswer above so the
  // just-answered turn is included. Guarded by checkpointShownAt so it
  // fires at most once per session. Suppressed when this same answer
  // naturally completed the session (all gaps covered) — that path already
  // has its own "Topic complete" message, and there's no next exchange to
  // checkpoint into.
  const turnsAfterAnswer = await listTurnRows(session.id);
  const answeredCount = turnsAfterAnswer.filter((t) => t.answeredAt).length;
  const checkpointReached =
    status === "active" &&
    session.checkpointShownAt === null &&
    answeredCount >= SOFT_CHECKPOINT_THRESHOLD;

  let checkpointSummary: SocraticSessionSummary | null = null;

  if (checkpointReached) {
    await markCheckpointShown(session.id, now);
    checkpointSummary = buildSessionSummary(turnsAfterAnswer, topicRow, after);
  }

  return {
    action,
    degree: evaluation.degree,
    feedback: feedbackFor(action, evaluation),
    conceptLabel: turn.conceptLabel,
    covered,
    next: next ? rowToTurn(next) : null,
    status,
    conceptsCovered: inScope.filter((g) => g.state === "covered").length,
    conceptsTotal: inScope.length,
    topicMaturity: gapMaturity(after, depth),
    checkpointReached,
    checkpointSummary,
  };
}

// Shared finalize step for both hard-end triggers (issue #27, spec.md
// Decision 3 & 5) — `/done` (completeSessionNow) and the inactivity sweep
// (checkSessionIdle) both funnel through this one function, so there is
// exactly one place that decides what a hard-end summary looks like and
// exactly one place that performs the active -> completed transition.
// `completed: false` means this call lost the race (or the session was
// already completed) — the caller sends nothing in that case.
interface FinalizeResult {
  completed: boolean;
  summary: SocraticSessionSummary | null;
}

async function finalizeSession(
  sessionId: string,
  now: string,
): Promise<FinalizeResult | { error: SocraticError }> {
  const session = await getSocraticSessionRow(sessionId);

  if (!session) {
    return { error: "not_found" };
  }

  const turns = await listTurnRows(session.id);
  const updated = await completeSocraticSession(session.id, now);

  if (!updated) {
    return { completed: false, summary: null };
  }

  // #27's own minimum-exchange rule: a session that never had an answered
  // turn (e.g. /done or the sweep fires before the first answer) still gets
  // marked completed above, but produces no summary message.
  const answered = turns.filter((t) => t.answeredAt);

  if (answered.length === 0) {
    return { completed: true, summary: null };
  }

  const topicRow = await getTopicRow(session.topicId);

  if (!topicRow) {
    return { completed: true, summary: null };
  }

  const gaps = await listGapsForTopic(session.topicId);
  const summary = buildSessionSummary(turns, topicRow, gaps);

  return { completed: true, summary };
}

export async function checkSessionIdle(
  sessionId: string,
  now: string,
): Promise<CheckSessionIdleResult | { error: SocraticError }> {
  const session = await getSocraticSessionRow(sessionId);

  if (!session) {
    return { error: "not_found" };
  }

  if (session.status !== "active") {
    return { idle: false };
  }

  const turns = await listTurnRows(session.id);
  const pending = await pendingTurn(session.id);
  const last = lastActivityAt(pending, turns);
  const idleMs = new Date(now).getTime() - last.getTime();

  if (idleMs < SESSION_IDLE_THRESHOLD_MS) {
    return { idle: false };
  }

  const result = await finalizeSession(sessionId, now);

  if ("error" in result) {
    return result;
  }

  if (!result.completed) {
    return { idle: false };
  }

  return { idle: true, summary: result.summary };
}

export async function completeSessionNow(
  sessionId: string,
  now: string,
): Promise<CompleteSocraticSessionResult | { error: SocraticError }> {
  const result = await finalizeSession(sessionId, now);

  if ("error" in result) {
    return result;
  }

  return { completed: result.completed, summary: result.summary };
}

async function retryResult(
  topicRow: TopicRow,
  turn: SocraticTurnRow,
): Promise<AnswerSocraticResult> {
  const depth = rowDepth(topicRow);
  const gaps = await listGapsForTopic(topicRow.id);
  const inScope = inScopeGaps(gaps, depth);

  return {
    action: "retry",
    degree: null,
    feedback: "I didn't catch an answer there — give it another go:",
    conceptLabel: turn.conceptLabel,
    covered: false,
    next: rowToTurn(turn),
    status: "active",
    conceptsCovered: inScope.filter((g) => g.state === "covered").length,
    conceptsTotal: inScope.length,
    topicMaturity: gapMaturity(gaps, depth),
    checkpointReached: false,
    checkpointSummary: null,
  };
}

async function sessionDto(
  session: SocraticSessionRow,
  status: "active" | "completed",
  current: SocraticTurnRow | null,
): Promise<SocraticSession> {
  const topicRow = await getTopicRow(session.topicId);
  const depth = topicRow ? rowDepth(topicRow) : "working";
  const gaps = await listGapsForTopic(session.topicId);
  const inScope = inScopeGaps(gaps, depth);

  return {
    id: session.id,
    topicId: session.topicId,
    curriculumId: session.curriculumId,
    status,
    current: current ? rowToTurn(current) : null,
    conceptsTotal: inScope.length,
    conceptsCovered: inScope.filter((g) => g.state === "covered").length,
    topicMaturity: gapMaturity(gaps, depth),
  };
}

async function openNextConcept(
  sessionId: string,
  topicRow: TopicRow,
  now: string,
): Promise<SocraticTurnRow | null> {
  const gaps = await listGapsForTopic(topicRow.id);
  const gap = nextGapToProbe(gaps, rowDepth(topicRow));

  if (!gap) {
    return makeOpeningTurn(sessionId, topicRow, now);
  }

  return makeTurnForGap(sessionId, topicRow, gap, now);
}

async function makeTurnForGap(
  sessionId: string,
  topicRow: TopicRow,
  gap: Gap,
  now: string,
): Promise<SocraticTurnRow> {
  // LRU archetype rotation (issue #36) — always passes sessionId, so a
  // retry on this same (session, gap) pair later finds it via
  // getMostRecentTurnArchetype and reuses the framing instead of rotating
  // mid-conversation. This is the one caller that always passes it; push
  // and startProbe never do (see buildProbeQuestionForGap's own comment).
  const question = await buildProbeQuestionForGap(topicRow.id, gap, "socratic", now, sessionId);
  const prompt =
    question?.prompt ??
    `In your own words, explain ${gap.label} — and the tradeoffs you'd weigh.`;

  const order = (await listTurnRows(sessionId)).length + 1;
  const turn: SocraticTurnRow = {
    id: newId("sturn"),
    sessionId,
    gapId: gap.id,
    conceptLabel: gap.label,
    order,
    prompt,
    answer: null,
    degree: null,
    action: null,
    createdAt: new Date(now),
    answeredAt: null,
    archetype: question?.archetype ?? null,
  };

  await insertTurn(turn);

  return turn;
}

async function makeOpeningTurn(
  sessionId: string,
  topicRow: TopicRow,
  now: string,
): Promise<SocraticTurnRow> {
  const prompt = `In your own words, walk me through ${topicRow.title} — and where you'd choose differently and why.`;

  const order = (await listTurnRows(sessionId)).length + 1;
  const turn: SocraticTurnRow = {
    id: newId("sturn"),
    sessionId,
    gapId: null,
    conceptLabel: topicRow.title,
    order,
    prompt,
    answer: null,
    degree: null,
    action: null,
    createdAt: new Date(now),
    answeredAt: null,
    archetype: null,
  };

  await insertTurn(turn);

  return turn;
}

async function refreshTopicProgress(
  topicRow: TopicRow,
  now: string,
): Promise<void> {
  const gaps = await listGapsForTopic(topicRow.id);
  const attempts = Math.max(topicRow.progressAttempts, 1);
  const progress = progressFromGaps(gaps, rowDepth(topicRow), attempts, now);
  const remaining = inScopeGaps(gaps, rowDepth(topicRow)).filter(
    (g) => g.state === "open",
  );
  const learningStatus = remaining.length === 0 ? "reviewing" : "probing";

  await writeTopicProgress(topicRow.id, progress, learningStatus);
}

function cleanFragment(fragment: string): string {
  return fragment
    .trim()
    .replace(/^(but|however|although)\b[,:]?\s*/i, "")
    .replace(/[.!]+$/, "");
}

function feedbackFor(action: SocraticAction, evaluation: SocraticEval): string {
  if (action === "advance") {
    return "Right — that holds up.";
  }

  if (action === "point_out") {
    const right = cleanFragment(evaluation.whatWasRight);
    const flaw = cleanFragment(evaluation.pointOut);

    return `Yes, that's partially correct — ${right}, but ${flaw}.`;
  }

  if (action === "explain_hint") {
    return evaluation.explanation;
  }

  if (action === "move_on") {
    return "Let's move on for now — we'll come back to this one later.";
  }

  return `Here's the answer: ${evaluation.correctAnswer}`;
}

async function evaluateSocratic(
  topicTitle: string,
  conceptLabel: string,
  answer: string,
  grounding: string,
  curriculumId?: string,
): Promise<SocraticEval> {
  const prompt = [
    `Topic: ${topicTitle}`,
    `Concept being taught: ${conceptLabel}`,
    grounding
      ? `Ground truth (prefer over general knowledge):\n${grounding}`
      : "",
    `Learner's answer: ${answer}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.socraticEval);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: socraticEvalSchema },
      requestContext: curriculumId
        ? new RequestContext([["curriculumId", curriculumId]])
        : undefined,
    });

    if (result.object) {
      return result.object;
    }
  } catch (err) {
    log.error({ err, conceptLabel }, "socratic_eval_failed");
  }

  return {
    degree: "mostly_wrong",
    whatWasRight: "",
    pointOut: "Let's tighten that up.",
    explanation: `Reconsider ${conceptLabel} and what actually drives the tradeoff.`,
    correctAnswer: `The key idea behind ${conceptLabel} is worth revisiting in the source material.`,
  };
}
