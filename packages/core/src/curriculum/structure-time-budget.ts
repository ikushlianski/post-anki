// Phase 5's study-time-budget guardrail: a drafted structure should size
// itself to roughly 4-8 weeks of real study, not to how much grounding
// material a trusted-source web search happened to turn up. This is a
// rough, visible heuristic — not a precise estimate — shared between the
// backend (deciding whether a mid-chat regeneration needs a scope-growth
// nudge) and the frontend (rendering a readout next to the draft tree), so
// both sides always agree on the same number.

const HOURS_PER_TOPIC = 1.5;
const HOURS_PER_TOPICLESS_MODULE = 2;
const ASSUMED_STUDY_HOURS_PER_WEEK = 4;
const TARGET_MAX_WEEKS = 8;

export interface StructureTimeEstimateModule {
  topics: unknown[];
}

export interface StructureTimeEstimate {
  totalModules: number;
  totalTopics: number;
  estimatedHours: number;
  estimatedWeeks: number;
}

/**
 * A topic-less module (an architect-agent-permitted "single coherent point"
 * with an empty topics array) still costs some study time of its own, so
 * it's weighted separately rather than contributing zero.
 */
export function estimateStructureStudyTime(
  modules: StructureTimeEstimateModule[],
): StructureTimeEstimate {
  const totalModules = modules.length;
  const totalTopics = modules.reduce((sum, m) => sum + m.topics.length, 0);
  const topicLessModules = modules.filter((m) => m.topics.length === 0).length;

  const estimatedHours =
    totalTopics * HOURS_PER_TOPIC + topicLessModules * HOURS_PER_TOPICLESS_MODULE;
  const estimatedWeeks = Math.max(
    1,
    Math.round(estimatedHours / ASSUMED_STUDY_HOURS_PER_WEEK),
  );

  return { totalModules, totalTopics, estimatedHours, estimatedWeeks };
}

/**
 * Called only for a regeneration triggered by the learner's own "research
 * this more" flags — a plain nudge, not a block, per the plan's "chat nudge,
 * not a hard validation block" requirement. Says nothing when the new
 * structure is still within budget, or when it didn't grow at all (e.g. the
 * learner's message trimmed something down instead).
 */
export function buildScopeGrowthNote(
  previous: StructureTimeEstimate,
  next: StructureTimeEstimate,
): string | null {
  if (next.estimatedWeeks <= TARGET_MAX_WEEKS) {
    return null;
  }

  if (next.estimatedWeeks <= previous.estimatedWeeks) {
    return null;
  }

  return `Heads up — that expanded the course to roughly ${next.estimatedWeeks} weeks of study, past the usual 4-8 week target. Want me to trim something, or is that OK?`;
}
