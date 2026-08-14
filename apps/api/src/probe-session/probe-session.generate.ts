import {
  generatedProbeBatchSchema,
  type GeneratedProbeQuestion,
  type Gap,
  type ProbeScope,
} from "@post-anki/shared";
import {
  buildFeedbackDigest,
  openGaps,
  planCurriculumQuizDistribution,
  planModuleQuizDistribution,
  rankDueGapsForQuiz,
  rankGapsForReplenish,
  sanitizeOptionExplanations,
  scaleTopicQuizTotal,
  selectQuizDifficultyMix,
  selectRecentFeedback,
  type CurriculumQuizPlan,
  type FeedbackRow,
  type GapMasteryDueInfo,
} from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { listGapsForTopic } from "../gap/gap.repo.js";
import {
  getTopicGapMasterySequenceNumbers,
  listGapMasteryForGapIds,
} from "../gap/gap-mastery.repo.js";
import { gatherProbeGrounding } from "../probe/probe-grounding.js";
import {
  getCurriculumSourceRows,
  getLowerLevelCoverage,
} from "../curriculum/curriculum.repo.js";
import { getFeedbackForTopic } from "../feedback/feedback.repo.js";
import type { ScopeContext, ScopeTopic } from "./probe-session.repo.js";
import { normalize } from "./probe-session.map.js";

const MODULE_TARGET = 16;
const MIN_TOTAL = 10;
// Matches this file's own MODULE_TARGET (16) and curriculum-plan.ts's
// CURRICULUM_QUIZ_MAX_TOTAL (20) — the two existing "sane one-sitting quiz
// size" precedents in this package bracket 16-20. Topic scope is the
// deepest single-topic focus of the three (module spreads MODULE_TARGET
// across several topics at ~1-2 questions each; curriculum spans an entire
// course at one question per topic), so it sits at the TOP of that
// already-established range rather than introducing an unrelated fourth
// number (issue #96).
const TOPIC_QUIZ_CEILING = 20;
// The replenish floor and batch size are deliberately the same number
// (SCENARIO 17/18: keep at least 10 ready). A fixed size — rather than
// reusing targetTotal's gap-count-scaled formula — keeps a top-up batch a
// small, predictable, fast top-up rather than another full-sized initial
// batch; the gap list it draws from is already narrowed to this session's
// own currently-open gaps (see generateReplenishBatch), so it doesn't need
// to be as large as the first batch to still be useful.
const REPLENISH_BATCH_SIZE = MIN_TOTAL;

function curriculumPlanFor(ctx: ScopeContext): CurriculumQuizPlan {
  return planCurriculumQuizDistribution(
    ctx.topics.map((t) => ({ topicId: t.id, priority: t.priority })),
  );
}

function targetTotal(
  scope: ProbeScope,
  ctx: ScopeContext,
  topicGapCount: number,
): number {
  if (scope === "topic") {
    return scaleTopicQuizTotal(topicGapCount, MIN_TOTAL, TOPIC_QUIZ_CEILING);
  }

  if (scope === "curriculum") {
    return curriculumPlanFor(ctx).total;
  }

  const plan = planModuleQuizDistribution(
    ctx.topics.map((t) => t.id),
    MODULE_TARGET,
  );

  return Math.max(plan.total, MIN_TOTAL);
}

async function knownUrlAllowlistBlock(
  curriculumId: string,
  citations: string[],
  fromWeb: boolean,
): Promise<string> {
  if (citations.length === 0) {
    return "No known documentation URLs are available for this material — leave every citationUrl null.";
  }

  if (fromWeb) {
    return [
      "Known documentation URLs (cite ONLY from this exact list, copied verbatim, or use null):",
      ...citations.map((url) => `- ${url}`),
    ].join("\n");
  }

  const sourceRows = await getCurriculumSourceRows(curriculumId);
  const titleByUrl = new Map<string, string | null>();

  for (const row of sourceRows) {
    titleByUrl.set(row.value, row.title);
  }

  return [
    "Known documentation URLs (cite ONLY from this exact list, copied verbatim, or use null):",
    ...citations.map((url) => {
      const title = titleByUrl.get(url);

      return title ? `- ${url} — ${title}` : `- ${url}`;
    }),
  ].join("\n");
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

function priorLevelCoverageLine(priorLevelCoverage: string[]): string {
  if (priorLevelCoverage.length === 0) {
    return "";
  }

  return `Already covered at a lower level: ${priorLevelCoverage.join(", ")} — build on these, don't re-teach them.`;
}

function topicBlock(
  topicTitle: string,
  summary: string | null,
  gapLabels: string[],
  feedbackDigest: string | null,
  priorLevelCoverage: string[],
): string {
  return [
    `Topic: ${topicTitle}`,
    summary ? `Why it matters: ${summary}` : "",
    gapLabels.length > 0
      ? `Concepts the learner must demonstrate (tag each question with the closest one as gapLabel, verbatim):\n${gapLabels
          .map((l) => `- ${l}`)
          .join("\n")}`
      : "No concept list yet — infer the core concepts of this topic.",
    feedbackDigest ?? "",
    priorLevelCoverageLine(priorLevelCoverage),
  ]
    .filter(Boolean)
    .join("\n");
}

function multiSelectLine(allowMultiSelect: boolean): string {
  if (!allowMultiSelect) {
    return "Every question has exactly one correct option — never produce a \"select all that apply\" question.";
  }

  return [
    "Most questions still have exactly one correct option (type \"single\").",
    "Where it fits naturally, you may produce a small number of \"select all that apply\" questions:",
    "set type to \"multi\", list every correct option's index in correctAnswerIndexes (2+ correct options),",
    "and still set correctAnswerIndex to any one of the correct options as a fallback.",
  ].join("\n");
}

function optionExplanationsLine(): string {
  return [
    "For every question, set optionExplanations to exactly one entry per option, in the same",
    "order as options — { text, citationUrl }. text must state briefly and specifically why",
    "THAT option is right or wrong (grounded in the material below when material is supplied,",
    "otherwise general knowledge) — never a generic \"that's wrong\" repeated across options.",
    "citationUrl must be copied verbatim from the known-URL list below when a specific passage",
    "supports that option's explanation, or null otherwise — never invent or paraphrase a URL.",
  ].join("\n");
}

async function buildPrompt(
  scope: ProbeScope,
  ctx: ScopeContext,
  gapsByTopic: Map<string, string[]>,
  feedbackByTopic: Map<string, string | null>,
  priorLevelCoverageByTopic: Map<string, string[]>,
  total: number,
  grounding: string,
  allowMultiSelect: boolean,
  knownUrlBlock: string,
): Promise<string> {
  const header = [
    `Produce exactly ${total} quiz questions that TEST the learner's knowledge.`,
    "Span difficulty from simple true/false up to harder multiple-choice.",
    "For true_false use format \"true_false\" with options [\"True\",\"False\"].",
    "For multiple-choice use format \"mcq\" with 3-4 options.",
    "Always set correctAnswerIndex to the single correct option.",
    "Each question must be answerable deterministically and have exactly one correct option.",
    multiSelectLine(allowMultiSelect),
    difficultyLine(ctx, total),
    optionExplanationsLine(),
    knownUrlBlock,
  ].join("\n");

  if (scope === "topic") {
    const topic = ctx.topics[0]!;

    return [
      header,
      "",
      topicBlock(
        topic.title,
        topic.summary,
        gapsByTopic.get(topic.id) ?? [],
        feedbackByTopic.get(topic.id) ?? null,
        priorLevelCoverageByTopic.get(topic.id) ?? [],
      ),
      `Set topicTitle to "${topic.title}" on every question.`,
      grounding
        ? `\nGround the questions in this material (prefer it over general knowledge):\n${grounding}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (scope === "curriculum") {
    const plan = curriculumPlanFor(ctx);
    const countByTopicId = new Map(plan.perTopic.map((p) => [p.topicId, p.count]));

    const topicBlocks = ctx.topics
      .map((t) => {
        const count = countByTopicId.get(t.id) ?? 1;

        return `${topicBlock(
          t.title,
          t.summary,
          gapsByTopic.get(t.id) ?? [],
          feedbackByTopic.get(t.id) ?? null,
          priorLevelCoverageByTopic.get(t.id) ?? [],
        )}\nAsk about ${count} question(s) for this topic; set topicTitle to "${t.title}".`;
      })
      .join("\n\n");

    return [
      header,
      `This is a ONE-TIME CALIBRATION quiz spanning ${ctx.topics.length} topics across the whole curriculum "${ctx.title}", weighted toward the learner's higher-priority topics. Every question must belong to exactly one topic — do NOT produce integrative/cross-topic questions here.`,
      "",
      topicBlocks,
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

      return `${topicBlock(
        t.title,
        t.summary,
        gapsByTopic.get(t.id) ?? [],
        feedbackByTopic.get(t.id) ?? null,
        priorLevelCoverageByTopic.get(t.id) ?? [],
      )}\nAsk about ${count} question(s) for this topic; set topicTitle to "${t.title}".`;
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
  // The topic an unmatched question (no topicTitle match) falls back to.
  // Equal to `ctx.topics[0]?.id` for every scope except "curriculum", where
  // it must instead point at the plan-narrowed topic set (see
  // `narrowToCurriculumPlan`) — otherwise a fallback could land on a topic
  // that was never actually asked about in this batch.
  defaultTopicId: string;
}

interface TopicContext {
  gapLists: Gap[][];
  feedbackLists: FeedbackRow[][];
  priorLevelCoverageLists: string[][];
  // Generalized recall-gap mastery tracking (issue #57) — the raw
  // gap_mastery scheduling state (scheduledForSequence, unlike the
  // public-facing Gap.mastery view) keyed by gapId, per topic, plus each
  // topic's own current gapMasterySequenceNumber — the two inputs
  // rankDueGapsForQuiz needs to gate the "due-ranked" replenish selection.
  gapMasteryByTopic: Map<string, GapMasteryDueInfo>[];
  gapMasterySequenceByTopic: Map<string, number>;
}

async function loadTopicContext(ctx: ScopeContext): Promise<TopicContext> {
  const [gapLists, feedbackLists, priorLevelCoverageLists] = await Promise.all([
    Promise.all(ctx.topics.map((t) => listGapsForTopic(t.id))),
    Promise.all(ctx.topics.map((t) => getFeedbackForTopic(t.id))),
    Promise.all(ctx.topics.map((t) => getLowerLevelCoverage(t.id))),
  ]);

  const [gapMasteryByTopic, gapMasterySequenceByTopic] = await Promise.all([
    Promise.all(
      gapLists.map(async (gaps) => {
        const rows = await listGapMasteryForGapIds(gaps.map((g) => g.id));

        return new Map<string, GapMasteryDueInfo>(
          Array.from(rows.entries()).map(([gapId, row]) => [
            gapId,
            {
              gapId,
              status: row.status as GapMasteryDueInfo["status"],
              scheduledForSequence: row.scheduledForSequence,
            },
          ]),
        );
      }),
    ),
    getTopicGapMasterySequenceNumbers(ctx.topics.map((t) => t.id)),
  ]);

  return { gapLists, feedbackLists, priorLevelCoverageLists, gapMasteryByTopic, gapMasterySequenceByTopic };
}

interface GapSelection {
  gapsByTopic: Map<string, string[]>;
  gapIdByKey: Map<string, string>;
  topicIdByTitle: Map<string, string>;
  feedbackByTopic: Map<string, string | null>;
  priorLevelCoverageByTopic: Map<string, string[]>;
}

/**
 * Selects and orders which gap labels each topic's block in the prompt
 * lists. The initial batch (`mode: "all"`) keeps today's behavior — every
 * non-skipped gap, unordered — since a fresh batch has no "this session"
 * history yet to prioritize by. A replenish batch (`mode: "due-ranked"`,
 * renamed from the original "open-ranked" — issue #57) narrows to this
 * session's own topics' currently-open gaps, orders them via
 * `rankGapsForReplenish` (SCENARIO 19, unchanged), and ADDITIONALLY excludes
 * a mastery-tracked gap whose recycle schedule hasn't arrived yet
 * (`rankDueGapsForQuiz` — the anti-spam guard, GENGAP.S3): a gap with no
 * `gap_mastery` row at all is always eligible (existing behavior,
 * unchanged); a mastery-tracked struggling/practicing gap is only eligible
 * once `scheduledForSequence <= topics.gapMasterySequenceNumber`.
 *
 * `rankDueGapsForQuiz` gates ONLY the "due-ranked" (replenish) candidate
 * list, not "all" mode. This is deliberate, not an oversight: "all" mode
 * also drives a brand-new session's very first batch (via `regenerate:
 * true`, prepareProbeSession), and S4's session-identity proof requires a
 * struggling/practicing gap to reliably resurface in EACH new session
 * regardless of how far the shared per-topic answered-question counter has
 * advanced (which may not have crossed its schedule at all between two
 * back-to-back test sessions that each only answer one question) — S3's
 * anti-spam guard is specifically about NOT re-serving a struggling gap
 * into the very next REPLENISH within the SAME still-open session, which is
 * what "due-ranked" mode alone (used only by generateReplenishBatch) both
 * targets and proves.
 */
function selectGaps(
  ctx: ScopeContext,
  topicCtx: TopicContext,
  mode: "all" | "due-ranked",
): GapSelection {
  const gapsByTopic = new Map<string, string[]>();
  const gapIdByKey = new Map<string, string>();
  const topicIdByTitle = new Map<string, string>();
  const feedbackByTopic = new Map<string, string | null>();
  const priorLevelCoverageByTopic = new Map<string, string[]>();

  ctx.topics.forEach((t: ScopeTopic, i: number) => {
    topicIdByTitle.set(normalize(t.title), t.id);

    const selected =
      mode === "all"
        ? topicCtx.gapLists[i]!.filter((g) => g.state !== "skipped")
        : rankDueGapsForQuiz(
            rankGapsForReplenish(openGaps(topicCtx.gapLists[i]!, t.depth)),
            topicCtx.gapMasteryByTopic[i]!,
            topicCtx.gapMasterySequenceByTopic.get(t.id) ?? 0,
          );

    gapsByTopic.set(
      t.id,
      selected.map((g) => g.label),
    );
    selected.forEach((g) => {
      gapIdByKey.set(`${t.id}::${normalize(g.label)}`, g.id);
    });
    feedbackByTopic.set(
      t.id,
      buildFeedbackDigest(selectRecentFeedback(topicCtx.feedbackLists[i]!)),
    );
    priorLevelCoverageByTopic.set(t.id, topicCtx.priorLevelCoverageLists[i]!);
  });

  return { gapsByTopic, gapIdByKey, topicIdByTitle, feedbackByTopic, priorLevelCoverageByTopic };
}

/**
 * A curriculum can include far more topics than a 10-20 question batch can
 * cover — narrowing down to the plan's chosen topics BEFORE gap/feedback
 * lookups (rather than after) avoids fetching context for topics that never
 * end up in the prompt, and keeps `ctx.topics[0]` (the `defaultTopicId`
 * fallback for an unmatched question) pointing at one of the topics actually
 * asked about.
 */
function narrowToCurriculumPlan(ctx: ScopeContext): ScopeContext {
  const plan = curriculumPlanFor(ctx);
  const chosenIds = new Set(plan.perTopic.map((p) => p.topicId));

  return { ...ctx, topics: ctx.topics.filter((t) => chosenIds.has(t.id)) };
}

export async function generateProbeBatch(
  scope: ProbeScope,
  ctx: ScopeContext,
  allowMultiSelect = false,
): Promise<GeneratedBatch> {
  const scopedCtx = scope === "curriculum" ? narrowToCurriculumPlan(ctx) : ctx;
  const topicCtx = await loadTopicContext(scopedCtx);
  const { gapsByTopic, gapIdByKey, topicIdByTitle, feedbackByTopic, priorLevelCoverageByTopic } =
    selectGaps(scopedCtx, topicCtx, "all");

  const total = targetTotal(
    scope,
    scopedCtx,
    gapsByTopic.get(scopedCtx.topics[0]?.id ?? "")?.length ?? 0,
  );

  return runGeneration(
    scope,
    scopedCtx,
    allowMultiSelect,
    total,
    gapsByTopic,
    gapIdByKey,
    topicIdByTitle,
    feedbackByTopic,
    priorLevelCoverageByTopic,
  );
}

/**
 * A mid-session top-up batch, triggered once a session's remaining
 * unanswered questions drops to the replenish floor (SCENARIO 17, 18). Uses
 * the exact same per-curriculum grounding/citation logic as the initial
 * batch (critical for a "tag" scope session spanning multiple curricula —
 * SCENARIO 14's grounding correctness must hold for replenish batches too,
 * not just the first one), but narrows and ranks each topic's gap list via
 * `rankGapsForReplenish` so the new questions are biased toward concepts
 * this learner is actually still missing (SCENARIO 19), rather than
 * uniformly resampling the topic's whole original gap list.
 */
export async function generateReplenishBatch(
  scope: ProbeScope,
  ctx: ScopeContext,
  allowMultiSelect = false,
): Promise<GeneratedBatch> {
  const topicCtx = await loadTopicContext(ctx);
  const { gapsByTopic, gapIdByKey, topicIdByTitle, feedbackByTopic, priorLevelCoverageByTopic } =
    selectGaps(ctx, topicCtx, "due-ranked");

  return runGeneration(
    scope,
    ctx,
    allowMultiSelect,
    REPLENISH_BATCH_SIZE,
    gapsByTopic,
    gapIdByKey,
    topicIdByTitle,
    feedbackByTopic,
    priorLevelCoverageByTopic,
  );
}

async function runGeneration(
  scope: ProbeScope,
  ctx: ScopeContext,
  allowMultiSelect: boolean,
  total: number,
  gapsByTopic: Map<string, string[]>,
  gapIdByKey: Map<string, string>,
  topicIdByTitle: Map<string, string>,
  feedbackByTopic: Map<string, string | null>,
  priorLevelCoverageByTopic: Map<string, string[]>,
): Promise<GeneratedBatch> {
  // Grounding is gathered per distinct curriculum, not once per ctx —
  // ctx.curriculumId is only a single value for module/topic scope. For a
  // "tag" scope session, ctx.topics can each belong to a different
  // curriculum, and each question must stay grounded in (and only cite)
  // its own topic's own curriculum's material (SCENARIO 14). Module/topic
  // scope always has exactly one distinct curriculumId, so this collapses
  // back to today's single grounding call with no behavior change.
  const firstTopicByCurriculumId = new Map<string, string>();

  for (const t of ctx.topics) {
    if (!firstTopicByCurriculumId.has(t.curriculumId)) {
      firstTopicByCurriculumId.set(t.curriculumId, t.title);
    }
  }

  const curriculumIds = Array.from(firstTopicByCurriculumId.keys());
  const singleCurriculum = curriculumIds.length <= 1;

  const groundingByCurriculumId = new Map<
    string,
    Awaited<ReturnType<typeof gatherProbeGrounding>>
  >();

  await Promise.all(
    curriculumIds.map(async (curriculumId) => {
      const focus = singleCurriculum
        ? ctx.title
        : (firstTopicByCurriculumId.get(curriculumId) ?? ctx.title);
      const grounding = await gatherProbeGrounding(curriculumId, focus, focus);

      groundingByCurriculumId.set(curriculumId, grounding);
    }),
  );

  const citationsByTopicId = new Map<string, string[]>();

  for (const t of ctx.topics) {
    citationsByTopicId.set(
      t.id,
      groundingByCurriculumId.get(t.curriculumId)?.citations ?? [],
    );
  }

  const groundingTextBlocks = await Promise.all(
    curriculumIds.map(async (curriculumId) => {
      const grounding = groundingByCurriculumId.get(curriculumId)!;

      if (grounding.text.trim().length === 0) {
        return "";
      }

      const label = singleCurriculum
        ? ""
        : `Material for "${firstTopicByCurriculumId.get(curriculumId)}" and its curriculum:\n`;

      return `${label}${grounding.text}`;
    }),
  );
  const combinedGroundingText = groundingTextBlocks.filter(Boolean).join("\n\n---\n\n");

  const knownUrlBlocks = await Promise.all(
    curriculumIds.map((curriculumId) => {
      const grounding = groundingByCurriculumId.get(curriculumId)!;

      return knownUrlAllowlistBlock(curriculumId, grounding.citations, grounding.fromWeb);
    }),
  );
  const combinedKnownUrlBlock = knownUrlBlocks.join("\n\n");

  const prompt = await buildPrompt(
    scope,
    ctx,
    gapsByTopic,
    feedbackByTopic,
    priorLevelCoverageByTopic,
    total,
    combinedGroundingText,
    allowMultiSelect,
    combinedKnownUrlBlock,
  );

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.probeQuizBatch);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: generatedProbeBatchSchema },
    });

    if (result.object) {
      return {
        questions: result.object.questions.map((q) => {
          const topicId = q.topicTitle ? topicIdByTitle.get(normalize(q.topicTitle)) : undefined;
          // A single-curriculum batch (module/topic scope, always) has one
          // citation list regardless of which topic a question resolves
          // to — fall back to it even when topicTitle didn't cleanly match
          // one of ctx.topics (e.g. an integrative question). Only a
          // genuinely multi-curriculum "tag" batch needs the stricter
          // per-topic match, since a wrong fallback there could leak one
          // curriculum's URL onto another curriculum's question.
          const citations = topicId
            ? (citationsByTopicId.get(topicId) ?? [])
            : singleCurriculum
              ? (groundingByCurriculumId.get(curriculumIds[0]!)?.citations ?? [])
              : [];

          return {
            ...q,
            optionExplanations: sanitizeOptionExplanations(
              q.optionExplanations ?? [],
              citations,
            ),
          };
        }),
        gapIdByKey,
        topicIdByTitle,
        defaultTopicId: ctx.topics[0]?.id ?? "",
      };
    }
  } catch (err) {
    log.error({ err, scope, scopeId: ctx.scopeId }, "probe_batch_failed");
  }

  return { questions: [], gapIdByKey, topicIdByTitle, defaultTopicId: ctx.topics[0]?.id ?? "" };
}
