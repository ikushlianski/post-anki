import type { ModuleQuizPlan } from "./module-plan";

export interface CurriculumQuizTopicInput {
  topicId: string;
  priority: number;
}

export type CurriculumQuizPlan = ModuleQuizPlan;

// A calibration probe stays within "10-20 questions" (spec) regardless of
// how many topics a curriculum includes.
export const CURRICULUM_QUIZ_MIN_TOTAL = 10;
export const CURRICULUM_QUIZ_MAX_TOTAL = 20;

/**
 * Picks which topics a curriculum-wide calibration batch asks about and how
 * many questions each gets, weighted toward higher priority.
 *
 * A curriculum with more included topics than the batch can cover (more than
 * `CURRICULUM_QUIZ_MAX_TOTAL`) simply drops the lowest-priority topics from
 * this round rather than giving each a sliver of a question — every topic
 * that IS included gets exactly one question. A curriculum with few topics
 * instead hands out extra questions round-robin, highest priority first, so
 * the batch still reaches the 10-question floor.
 *
 * No separate integrative/cross-topic slot (unlike `planModuleQuizDistribution`,
 * which is for ongoing practice): a calibration probe's whole purpose is a
 * clean per-topic strong/weak signal, and a question spanning two topics
 * can't attribute a wrong answer to either one.
 */
export function planCurriculumQuizDistribution(
  topics: CurriculumQuizTopicInput[],
): CurriculumQuizPlan {
  if (topics.length === 0) {
    return { perTopic: [], integrative: 0, total: 0 };
  }

  const ranked = [...topics]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, CURRICULUM_QUIZ_MAX_TOTAL);
  const n = ranked.length;
  const target = Math.max(n, CURRICULUM_QUIZ_MIN_TOTAL);

  const counts = new Map(ranked.map((t) => [t.topicId, 1]));
  let remaining = target - n;
  let cursor = 0;

  while (remaining > 0) {
    const topicId = ranked[cursor % n]!.topicId;

    counts.set(topicId, counts.get(topicId)! + 1);
    remaining -= 1;
    cursor += 1;
  }

  const perTopic = ranked.map((t) => ({ topicId: t.topicId, count: counts.get(t.topicId)! }));
  const total = perTopic.reduce((sum, slot) => sum + slot.count, 0);

  return { perTopic, integrative: 0, total };
}
