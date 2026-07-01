import {
  generatedProbeBatchSchema,
  type GeneratedProbeQuestion,
  type ProbeScope,
} from "@post-anki/shared";
import {
  planModuleQuizDistribution,
  selectQuizDifficultyMix,
} from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { listGapsForTopic } from "../gap/gap.repo.js";
import { gatherProbeGrounding } from "../probe/probe-grounding.js";
import type { ScopeContext } from "./probe-session.repo.js";
import { clamp, normalize } from "./probe-session.map.js";

const TOPIC_TARGET = 12;
const MODULE_TARGET = 16;
const MIN_TOTAL = 10;
const MAX_TOTAL = 20;

function targetTotal(scope: ProbeScope, ctx: ScopeContext): number {
  if (scope === "topic") {
    return TOPIC_TARGET;
  }

  const plan = planModuleQuizDistribution(
    ctx.topics.map((t) => t.id),
    MODULE_TARGET,
  );

  return clamp(plan.total, MIN_TOTAL, MAX_TOTAL);
}

function difficultyLine(ctx: ScopeContext, total: number): string {
  const priorMaturity = ctx.priorMaturity > 0 ? ctx.priorMaturity : null;
  const mix = selectQuizDifficultyMix(priorMaturity, total);

  return `Aim for roughly ${mix.easy} easy, ${mix.medium} medium, and ${mix.hard} hard questions${
    priorMaturity === null
      ? " (this is a fresh topic — start gentle and build up)."
      : ` (prior score ${ctx.priorMaturity}% — push harder where the basics are solid).`
  }`;
}

function topicBlock(
  topicTitle: string,
  summary: string | null,
  gapLabels: string[],
): string {
  return [
    `Topic: ${topicTitle}`,
    summary ? `Why it matters: ${summary}` : "",
    gapLabels.length > 0
      ? `Concepts the learner must demonstrate (tag each question with the closest one as gapLabel, verbatim):\n${gapLabels
          .map((l) => `- ${l}`)
          .join("\n")}`
      : "No concept list yet — infer the core concepts of this topic.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildPrompt(
  scope: ProbeScope,
  ctx: ScopeContext,
  gapsByTopic: Map<string, string[]>,
  total: number,
  grounding: string,
): Promise<string> {
  const header = [
    `Produce exactly ${total} quiz questions that TEST the learner's knowledge.`,
    "Span difficulty from simple true/false up to harder multiple-choice.",
    "For true_false use format \"true_false\" with options [\"True\",\"False\"].",
    "For multiple-choice use format \"mcq\" with 3-4 options.",
    "Always set correctAnswerIndex to the single correct option.",
    "Each question must be answerable deterministically and have exactly one correct option.",
    difficultyLine(ctx, total),
  ].join("\n");

  if (scope === "topic") {
    const topic = ctx.topics[0]!;

    return [
      header,
      "",
      topicBlock(topic.title, topic.summary, gapsByTopic.get(topic.id) ?? []),
      `Set topicTitle to "${topic.title}" on every question.`,
      grounding
        ? `\nGround the questions in this material (prefer it over general knowledge):\n${grounding}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const plan = planModuleQuizDistribution(
    ctx.topics.map((t) => t.id),
    MODULE_TARGET,
  );
  const countByTopicId = new Map(plan.perTopic.map((p) => [p.topicId, p.count]));

  const topicBlocks = ctx.topics
    .map((t) => {
      const count = countByTopicId.get(t.id) ?? 1;

      return `${topicBlock(t.title, t.summary, gapsByTopic.get(t.id) ?? [])}\nAsk about ${count} question(s) for this topic; set topicTitle to "${t.title}".`;
    })
    .join("\n\n");

  return [
    header,
    `This is a BROAD module quiz spanning ${ctx.topics.length} topics. Also add ${plan.integrative} integrative question(s) that connect two or more topics (set topicTitle to the most relevant topic).`,
    "",
    topicBlocks,
    grounding
      ? `\nGround the questions in this material (prefer it over general knowledge):\n${grounding}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface GeneratedBatch {
  questions: GeneratedProbeQuestion[];
  gapIdByKey: Map<string, string>;
  topicIdByTitle: Map<string, string>;
}

export async function generateProbeBatch(
  scope: ProbeScope,
  ctx: ScopeContext,
): Promise<GeneratedBatch> {
  const total = targetTotal(scope, ctx);

  const gapLists = await Promise.all(
    ctx.topics.map((t) => listGapsForTopic(t.id)),
  );

  const gapsByTopic = new Map<string, string[]>();
  const gapIdByKey = new Map<string, string>();
  const topicIdByTitle = new Map<string, string>();

  ctx.topics.forEach((t, i) => {
    topicIdByTitle.set(normalize(t.title), t.id);
    const usable = gapLists[i]!.filter((g) => g.state !== "skipped");
    gapsByTopic.set(
      t.id,
      usable.map((g) => g.label),
    );
    usable.forEach((g) => {
      gapIdByKey.set(`${t.id}::${normalize(g.label)}`, g.id);
    });
  });

  const grounding = await gatherProbeGrounding(
    ctx.curriculumId,
    ctx.title,
    ctx.title,
  );

  const prompt = await buildPrompt(
    scope,
    ctx,
    gapsByTopic,
    total,
    grounding.text,
  );

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.probeQuizBatch);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: generatedProbeBatchSchema },
    });

    if (result.object) {
      return {
        questions: result.object.questions,
        gapIdByKey,
        topicIdByTitle,
      };
    }
  } catch (err) {
    log.error({ err, scope, scopeId: ctx.scopeId }, "probe_batch_failed");
  }

  return { questions: [], gapIdByKey, topicIdByTitle };
}
