import type {
  AnswerSocraticInput,
  AnswerSocraticResult,
  Gap,
  SocraticAction,
  SocraticEval,
  SocraticSession,
  StartSocraticSessionInput,
} from "@post-anki/shared";
import { socraticEvalSchema } from "@post-anki/shared";
import {
  deriveSocraticAction,
  gapMaturity,
  inScopeGaps,
  nextGapToProbe,
  progressFromGaps,
} from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { listGapsForTopic, persistGaps } from "../gap/gap.repo.js";
import {
  getTopicRow,
  rowDepth,
  writeTopicProgress,
  type TopicRow,
} from "../topic/topic-progress.repo.js";
import { getCurriculumContextForTopic } from "../curriculum/curriculum.repo.js";
import { gatherProbeGrounding } from "../probe/probe-grounding.js";
import { buildProbeQuestionForGap } from "../probe/probe.service.js";
import {
  completeSocraticSession,
  createSocraticSession,
  getActiveSocraticSessionRow,
  getSocraticSessionRow,
  getTurnRow,
  insertTurn,
  listTurnRows,
  pendingTurn,
  recordTurnAnswer,
  type SocraticSessionRow,
  type SocraticTurnRow,
} from "./socratic.repo.js";
import { countPriorWrong, rowToTurn } from "./socratic.map.js";

export type SocraticError = "not_found" | "not_confirmed" | "turn_not_found";

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
  );

  const priorWrong = countPriorWrong(await listTurnRows(session.id), turn.gapId);
  const action = deriveSocraticAction({
    degree: evaluation.degree,
    priorWrongCount: priorWrong,
  });

  await recordTurnAnswer(turn.id, input.answer, evaluation.degree, action, now);

  const covered = action === "advance" || action === "give_answer";

  if (covered && gap && gap.state === "open") {
    await persistGaps([{ ...gap, state: "covered", lastEvaluatedAt: now }]);
  }

  await refreshTopicProgress(topicRow, now);

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
    return null;
  }

  return makeTurnForGap(sessionId, topicRow, gap, now);
}

async function makeTurnForGap(
  sessionId: string,
  topicRow: TopicRow,
  gap: Gap,
  now: string,
): Promise<SocraticTurnRow> {
  const question = await buildProbeQuestionForGap(topicRow.id, gap, "socratic");
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

function feedbackFor(action: SocraticAction, evaluation: SocraticEval): string {
  if (action === "advance") {
    return "Right — that holds up.";
  }

  if (action === "point_out") {
    return evaluation.pointOut;
  }

  if (action === "explain_hint") {
    return evaluation.explanation;
  }

  return `Here's the answer: ${evaluation.correctAnswer}`;
}

async function evaluateSocratic(
  topicTitle: string,
  conceptLabel: string,
  answer: string,
  grounding: string,
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
    });

    if (result.object) {
      return result.object;
    }
  } catch (err) {
    log.error({ err, conceptLabel }, "socratic_eval_failed");
  }

  return {
    degree: "mostly_wrong",
    pointOut: "Let's tighten that up.",
    explanation: `Reconsider ${conceptLabel} and what actually drives the tradeoff.`,
    correctAnswer: `The key idea behind ${conceptLabel} is worth revisiting in the source material.`,
  };
}
