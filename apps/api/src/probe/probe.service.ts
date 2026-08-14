import {
  probeEvaluationSchema,
  type Archetype,
  type Gap,
  type ProbeQuestion,
  type ProbeResult,
  type QuestionKind,
  type Speed,
  type StartProbeInput,
  type SubmitProbeInput,
} from "@post-anki/shared";
import {
  applyGapVerdicts,
  buildFeedbackDigest,
  isCalibrationStale,
  nextGapToProbe,
  normalizeApplicableArchetypes,
  openGaps,
  progressFromGaps,
  reactivateOnFail,
  selectArchetype,
  selectRecentFeedback,
} from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import {
  getTopicRow,
  rowDepth,
  writeTopicProgress,
  type TopicRow,
} from "../topic/topic-progress.repo.js";
import {
  insertDiscoveredGaps,
  listGapsForTopic,
  persistGaps,
} from "../gap/gap.repo.js";
import {
  getGapArchetypeState,
  recordArchetypeClassification,
  recordArchetypeUsage,
} from "../gap/gap-archetype.repo.js";
import {
  getCurriculumContextForTopic,
  getLowerLevelCoverage,
} from "../curriculum/curriculum.repo.js";
import { getFeedbackForTopic } from "../feedback/feedback.repo.js";
import { recordAnswerActivity } from "../liveness/answer-activity.js";
import {
  getMostRecentTurnArchetype,
  getRecentSessionExchangesForGap,
} from "../socratic/socratic.repo.js";
import { gatherProbeGrounding } from "./probe-grounding.js";
import { generatedQuestionSchema, type GeneratedQuestion } from "./probe-question.js";
import { localEvaluation, shouldScoreLocally } from "./probe-evaluation.js";

const ARCHETYPE_LABELS: Record<Archetype, string> = {
  scenario_based: "Scenario-based",
  compare_contrast: "Compare/contrast",
  design_challenge: "Design challenge",
  cross_cutting: "Cross-cutting",
  debug_challenge: "Debug challenge",
};

const MAX_QUICK_TEST_OPTIONS = 4;

export type ProbeError = "not_found" | "not_confirmed" | "gap_not_open";

interface AskContext {
  speed: Speed;
  hinting: boolean;
  grounding: string;
  citations: string[];
  priorLevelCoverage?: string[];
}

export async function startProbe(
  input: StartProbeInput,
  now: string = new Date().toISOString(),
): Promise<ProbeQuestion | { error: ProbeError }> {
  const topic = await getTopicRow(input.topicId);

  if (!topic) {
    return { error: "not_found" };
  }

  const ctx = await getCurriculumContextForTopic(input.topicId);

  if (!ctx || ctx.status !== "confirmed") {
    return { error: "not_confirmed" };
  }

  const gaps = await listGapsForTopic(input.topicId);
  const gap = nextGapToProbe(gaps, rowDepth(topic));
  const grounding = await gatherProbeGrounding(ctx.curriculumId, topic.title, topic.title);
  const priorLevelCoverage = await getLowerLevelCoverage(input.topicId);

  return buildQuestion(
    topic,
    gap,
    input.mode,
    {
      speed: ctx.speed,
      hinting: ctx.hinting,
      grounding: grounding.text,
      citations: grounding.citations,
      priorLevelCoverage,
    },
    now,
  );
}

export async function buildProbeQuestionForGap(
  topicId: string,
  gap: Gap,
  mode: QuestionKind,
  now: string = new Date().toISOString(),
  // LRU archetype rotation (issue #36) — trailing-optional, and ONLY ever
  // passed by socratic.service.ts's makeTurnForGap. push.controller.ts and
  // startProbe must never pass one: neither has a session concept, so both
  // always want a fresh LRU pick, never continuation.
  socraticSessionId?: string,
): Promise<ProbeQuestion | null> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    return null;
  }

  const ctx = await getCurriculumContextForTopic(topicId);

  if (!ctx) {
    return null;
  }

  const grounding = await gatherProbeGrounding(ctx.curriculumId, topic.title, gap.label);
  const priorLevelCoverage = await getLowerLevelCoverage(topicId);

  return buildQuestion(
    topic,
    gap,
    mode,
    {
      speed: ctx.speed,
      hinting: ctx.hinting,
      grounding: grounding.text,
      citations: grounding.citations,
      priorLevelCoverage,
    },
    now,
    socraticSessionId,
  );
}

export async function submitProbe(
  input: SubmitProbeInput,
  now: string,
): Promise<ProbeResult | { error: ProbeError }> {
  const topic = await getTopicRow(input.topicId);

  if (!topic) {
    return { error: "not_found" };
  }

  const ctx = await getCurriculumContextForTopic(input.topicId);

  if (!ctx || ctx.status !== "confirmed") {
    return { error: "not_confirmed" };
  }

  const gaps = await listGapsForTopic(input.topicId);
  const probed = input.gapId ? gaps.find((g) => g.id === input.gapId) ?? null : null;

  if (input.gapId && (!probed || probed.state !== "open")) {
    return { error: "gap_not_open" };
  }

  const evaluation = shouldScoreLocally(input.mode, probed)
    ? localEvaluation(probed as Gap, input.selfOutcome)
    : await evaluateAnswer(
        topic,
        probed,
        gaps,
        input,
        (await gatherProbeGrounding(ctx.curriculumId, topic.title, topic.title)).text,
      );

  // Issue #33 — one definition of "the user failed this gap", used both for
  // the reactivation below and for the reported `outcome`. A MISSING verdict
  // counts as a fail, matching what the old `outcome` expression already did
  // (`?.covered === true ? "pass" : "fail"`) — the freeform LLM path can omit
  // the probed gap's verdict entirely, so this cannot be hooked off
  // `applyGapVerdicts`' `coveredById.has(...)` branch alone.
  const probedFailed =
    probed !== null &&
    evaluation.verdicts.find((v) => v.gapId === probed.id)?.covered !== true;

  const updated = applyGapVerdicts(gaps, evaluation.verdicts, now).map((gap) =>
    probedFailed && gap.id === probed!.id ? reactivateOnFail(gap, now).gap : gap,
  );
  const coveredGapLabels = updated
    .filter(
      (g) =>
        g.state === "covered" &&
        gaps.find((o) => o.id === g.id)?.state === "open",
    )
    .map((g) => g.label);

  await persistGaps(updated);

  const discovered = await insertDiscoveredGaps(input.topicId, evaluation.newGaps, now);
  const allGaps = [...updated, ...discovered];

  const attempts = topic.progressAttempts + 1;
  const progress = progressFromGaps(allGaps, rowDepth(topic), attempts, now);
  const remaining = openGaps(allGaps, rowDepth(topic));
  const learningStatus = remaining.length === 0 ? "reviewing" : "probing";

  await writeTopicProgress(input.topicId, progress, learningStatus);
  await recordAnswerActivity(ctx.curriculumId, now);

  const outcome = probed ? (probedFailed ? "fail" : "pass") : "pass";

  return {
    outcome,
    coveredGapLabels,
    feedback: evaluation.nextPrompt ?? feedbackFor(outcome, Boolean(probed)),
    progress,
    learningStatus,
    nextQuestion: null,
  };
}

async function buildQuestion(
  topic: TopicRow,
  gap: Gap | null,
  mode: QuestionKind,
  ask: AskContext,
  now: string,
  socraticSessionId?: string,
): Promise<ProbeQuestion> {
  const { generated, archetype } = await generateQuestion(
    topic,
    gap,
    mode,
    ask,
    now,
    socraticSessionId,
  );

  return {
    gapId: gap?.id ?? null,
    gapLabel: gap?.label ?? null,
    kind: mode,
    prompt: generated.prompt,
    options:
      mode === "quick_test" && generated.options.length > 0
        ? generated.options.slice(0, MAX_QUICK_TEST_OPTIONS)
        : undefined,
    sources: ask.citations.length > 0 ? ask.citations : undefined,
    correctAnswerIndex: mode === "quick_test" ? generated.correctAnswerIndex : null,
    archetype,
  };
}

function paceHint(speed: Speed): string {
  if (speed === "slow") {
    return "take a smaller step, scaffold the question, keep it gentle";
  }

  if (speed === "fast") {
    return "assume competence — ask a harder, higher-leverage question and move on quickly";
  }

  return "standard difficulty for the target depth";
}

// LRU archetype rotation (issue #36) — the AGENT's structured-output
// contract (GeneratedQuestion) never carries the chosen archetype: the
// SERVICE already decided it before calling the agent. This wrapper keeps
// the two concerns separate at the type level instead of widening
// GeneratedQuestion.
interface QuestionWithArchetype {
  generated: GeneratedQuestion;
  archetype: Archetype | null;
}

interface ArchetypePlan {
  chosen: Archetype;
  promptLines: string[];
  onSuccess: (result: GeneratedQuestion) => Promise<void>;
}

// Only entered for mode === "socratic" && gap !== null (AC 19) — the
// opening question and quick_test never touch archetype logic at all.
async function planArchetypeForQuestion(
  gapId: string,
  socraticSessionId: string | undefined,
  now: string,
): Promise<ArchetypePlan> {
  if (socraticSessionId) {
    // Same-session continuation (a retry on a still-open gap within the
    // same active Socratic session) reuses the archetype verbatim — no
    // re-roll, no LRU write, no classification instruction even if
    // somehow unclassified.
    const continued = await getMostRecentTurnArchetype(socraticSessionId, gapId);

    if (continued) {
      return { chosen: continued, promptLines: [], onSuccess: async () => {} };
    }
  }

  const state = await getGapArchetypeState(gapId);

  if (!state) {
    // First-ever socratic question for this gap — force the Scenario-based
    // framing (the safe universal default) and ask the model to classify
    // which archetypes apply. No archetype context/history line — there is
    // none yet.
    return {
      chosen: "scenario_based",
      promptLines: [
        "Classify which of the 5 reference archetypes apply to this concept in " +
          "applicableArchetypes, per the filtering rules in your instructions.",
        "For THIS question, use the Scenario-based framing (the safe universal default).",
      ],
      onSuccess: async (result) => {
        const normalized = normalizeApplicableArchetypes(result.applicableArchetypes ?? []);

        await recordArchetypeClassification(gapId, normalized, "scenario_based", now);
      },
    };
  }

  // Already classified — select in-process (no LLM call), no classification
  // instruction at all this time, plus the last-3-sessions context block
  // when non-empty.
  const chosen = selectArchetype(state.applicableArchetypes, state.archetypeLastUsedAt);
  const exchanges = await getRecentSessionExchangesForGap(gapId, socraticSessionId ?? null);

  const promptLines = [
    `Framing archetype for this question: ${ARCHETYPE_LABELS[chosen]}. Write today's specific question fitting this framing.`,
  ];

  if (exchanges.length > 0) {
    promptLines.push(
      "Prior sessions discussing this concept — avoid repeating the same specific scenario or wording:",
      ...exchanges.flatMap((session) =>
        session.turns.map((turn) =>
          turn.answer
            ? `- Asked: ${turn.prompt} | Answered: ${turn.answer}`
            : `- Asked: ${turn.prompt}`,
        ),
      ),
    );
  }

  return {
    chosen,
    promptLines,
    onSuccess: async () => {
      await recordArchetypeUsage(gapId, chosen, now);
    },
  };
}

async function generateQuestion(
  topic: TopicRow,
  gap: Gap | null,
  mode: QuestionKind,
  ask: AskContext,
  now: string,
  socraticSessionId?: string,
): Promise<QuestionWithArchetype> {
  const agent = getMastra().getAgent(AGENT_KEYS.mentorAsk);

  // Read-time-only calibration floor (#26/#42): a gap that hasn't been
  // re-evaluated in 60+ days is asked about at "awareness" depth for this
  // one question. `gap.depth` itself is never written — nothing here
  // touches persistence, so the taxonomy classification stays intact.
  const targetDepth =
    gap && isCalibrationStale(gap.lastEvaluatedAt, now) ? "awareness" : gap?.depth;

  const focus = gap
    ? [`Gap to probe: ${gap.label}`, `Target depth: ${targetDepth}`]
    : [
        `Target depth: ${rowDepth(topic)}`,
        "This is the OPENING question — the learner has not been probed on this topic yet,",
        "and no specific gap has been identified. Ask ONE question that gets them to explain",
        "and reason about the core of this topic at the target depth, so their answer reveals",
        "what they do and do not yet grasp.",
      ];

  const feedbackRows = await getFeedbackForTopic(topic.id);
  const feedbackDigest = buildFeedbackDigest(selectRecentFeedback(feedbackRows));

  const archetypePlan =
    mode === "socratic" && gap !== null
      ? await planArchetypeForQuestion(gap.id, socraticSessionId, now)
      : null;

  const prompt = [
    `Topic: ${topic.title}`,
    topic.summary ? `Why it matters: ${topic.summary}` : "",
    ...focus,
    `Probing pace: ${ask.speed} — ${paceHint(ask.speed)}`,
    ask.hinting
      ? "Hinting is ON: after the question, add one short hint on its own line."
      : "Hinting is OFF: no hints.",
    ask.grounding
      ? `Ground the question in this material (prefer it over general knowledge):\n${ask.grounding}`
      : "",
    feedbackDigest ?? "",
    ask.priorLevelCoverage && ask.priorLevelCoverage.length > 0
      ? `Already covered at a lower level: ${ask.priorLevelCoverage.join(", ")} — build on these, don't re-teach them.`
      : "",
    ...(archetypePlan?.promptLines ?? []),
    `Question kind: ${mode}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: generatedQuestionSchema },
    });

    if (result.object) {
      if (archetypePlan) {
        await archetypePlan.onSuccess(result.object);
      }

      return { generated: result.object, archetype: archetypePlan?.chosen ?? null };
    }
  } catch (err) {
    log.error({ err, topicId: topic.id, gapId: gap?.id ?? null }, "probe_question_failed");
  }

  // The fallback question was never actually shown with any archetype
  // framing — no state write (see planArchetypeForQuestion's onSuccess,
  // never invoked here) and archetype is null, not archetypePlan.chosen,
  // so a later retry-branch lookup never finds a phantom framing for this
  // turn.
  return { generated: fallbackQuestion(topic, gap, mode), archetype: null };
}

async function evaluateAnswer(
  topic: TopicRow,
  probed: Gap | null,
  gaps: Gap[],
  input: SubmitProbeInput,
  grounding: string,
) {
  const open = gaps.filter((g) => g.state === "open");

  const prompt = [
    `Topic: ${topic.title}`,
    `Target depth: ${rowDepth(topic)}`,
    probed
      ? `Probed gap (id ${probed.id}): ${probed.label}`
      : "This was the OPENING question — no specific gap was targeted. Discover the gaps the learner's answer reveals (never deeper than the target depth).",
    "",
    "Open gaps on this topic:",
    ...open.map((g) => `- id ${g.id} [${g.depth}]: ${g.label}`),
    open.length === 0 ? "(none yet — discover the gaps this answer reveals)" : "",
    grounding
      ? `\nGround truth to judge against (prefer this over general knowledge):\n${grounding}`
      : "",
    "",
    `Question kind: ${input.mode}`,
    `Learner's answer: ${input.answer}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.mentorEval);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: probeEvaluationSchema },
    });

    if (result.object) {
      const validIds = new Set(open.map((g) => g.id));

      return {
        verdicts: result.object.verdicts.filter((v) => validIds.has(v.gapId)),
        newGaps: result.object.newGaps,
        nextPrompt: result.object.nextPrompt,
      };
    }
  } catch (err) {
    log.error({ err, topicId: topic.id, gapId: probed?.id ?? null }, "probe_eval_failed");
  }

  return { verdicts: [], newGaps: [], nextPrompt: null };
}

function fallbackQuestion(
  topic: TopicRow,
  gap: Gap | null,
  mode: QuestionKind,
): GeneratedQuestion {
  const subject = gap ? `"${gap.label}"` : `the core of "${topic.title}"`;

  if (mode === "quick_test") {
    return {
      prompt: `Which statement best reflects sound judgment about ${subject}?`,
      options: [
        "It depends on the tradeoffs in the specific context",
        "There is one universally correct approach",
        "It never matters in practice",
        "Only the framework's default is acceptable",
      ],
      correctAnswerIndex: 0,
    };
  }

  return {
    prompt: `In your own words, walk me through ${subject} — and where you'd choose differently and why.`,
    options: [],
    correctAnswerIndex: null,
  };
}

function feedbackFor(outcome: "pass" | "fail", hadGap: boolean): string {
  if (!hadGap) {
    return "Good start — here's what we'll dig into next.";
  }

  return outcome === "pass"
    ? "Solid — that holds up. We'll move to what's still open."
    : "Not yet — this one stays open so we can come back to it.";
}
