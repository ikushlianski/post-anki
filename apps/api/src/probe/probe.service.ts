import {
  probeEvaluationSchema,
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
  nextGapToProbe,
  openGaps,
  progressFromGaps,
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
import { getCurriculumContextForTopic } from "../curriculum/curriculum.repo.js";
import { gatherProbeGrounding } from "./probe-grounding.js";
import { generatedQuestionSchema, type GeneratedQuestion } from "./probe-question.js";
import { localEvaluation, shouldScoreLocally } from "./probe-evaluation.js";

const MAX_QUICK_TEST_OPTIONS = 4;

export type ProbeError = "not_found" | "not_confirmed" | "gap_not_open";

interface AskContext {
  speed: Speed;
  hinting: boolean;
  grounding: string;
  citations: string[];
}

export async function startProbe(
  input: StartProbeInput,
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

  return buildQuestion(topic, gap, input.mode, {
    speed: ctx.speed,
    hinting: ctx.hinting,
    grounding: grounding.text,
    citations: grounding.citations,
  });
}

export async function buildProbeQuestionForGap(
  topicId: string,
  gap: Gap,
  mode: QuestionKind,
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

  return buildQuestion(topic, gap, mode, {
    speed: ctx.speed,
    hinting: ctx.hinting,
    grounding: grounding.text,
    citations: grounding.citations,
  });
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

  const updated = applyGapVerdicts(gaps, evaluation.verdicts, now);
  const coveredGapLabels = updated
    .filter(
      (g) =>
        g.state === "covered" &&
        gaps.find((o) => o.id === g.id)?.state === "open",
    )
    .map((g) => g.label);

  await persistGaps(updated);

  const discovered = await insertDiscoveredGaps(input.topicId, evaluation.newGaps);
  const allGaps = [...updated, ...discovered];

  const attempts = topic.progressAttempts + 1;
  const progress = progressFromGaps(allGaps, rowDepth(topic), attempts, now);
  const remaining = openGaps(allGaps, rowDepth(topic));
  const learningStatus = remaining.length === 0 ? "reviewing" : "probing";

  await writeTopicProgress(input.topicId, progress, learningStatus);

  const outcome = probed
    ? evaluation.verdicts.find((v) => v.gapId === probed.id)?.covered === true
      ? "pass"
      : "fail"
    : "pass";

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
): Promise<ProbeQuestion> {
  const generated = await generateQuestion(topic, gap, mode, ask);

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

async function generateQuestion(
  topic: TopicRow,
  gap: Gap | null,
  mode: QuestionKind,
  ask: AskContext,
): Promise<GeneratedQuestion> {
  const agent = getMastra().getAgent(AGENT_KEYS.mentorAsk);

  const focus = gap
    ? [`Gap to probe: ${gap.label}`, `Target depth: ${gap.depth}`]
    : [
        `Target depth: ${rowDepth(topic)}`,
        "This is the OPENING question — the learner has not been probed on this topic yet,",
        "and no specific gap has been identified. Ask ONE question that gets them to explain",
        "and reason about the core of this topic at the target depth, so their answer reveals",
        "what they do and do not yet grasp.",
      ];

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
    `Question kind: ${mode}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: generatedQuestionSchema },
    });

    if (result.object) {
      return result.object;
    }
  } catch (err) {
    log.error({ err, topicId: topic.id, gapId: gap?.id ?? null }, "probe_question_failed");
  }

  return fallbackQuestion(topic, gap, mode);
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
