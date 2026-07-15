import type { CurriculumStats, GenerateRecommendationsResult } from "@post-anki/shared";
import { nextStepRecommendation } from "@post-anki/core";
import { log } from "../shared/log.js";
import { webSearch } from "../probe/probe-grounding.js";
import { getLearningMapSnapshots } from "../curriculum/curriculum.repo.js";
import {
  getCurriculumDetail,
  getRecommendationsForTopics,
  saveRecommendation,
  summarizeTopics,
  type TopicSummary,
} from "./stats.repo.js";

export type StatsError = "not_found";

const RECOMMENDATION_ELIGIBILITY_THRESHOLD = 2;

function weakSpotsOf(topics: TopicSummary[]): TopicSummary[] {
  return topics
    .filter((t) => t.attempts > 0 && t.maturity < 80)
    .sort((a, b) => a.maturity - b.maturity);
}

function strongPointsOf(topics: TopicSummary[]): TopicSummary[] {
  return topics.filter((t) => t.attempts > 0 && t.maturity >= 80).sort((a, b) => b.maturity - a.maturity);
}

function mostRecentlyStudiedTopicId(
  snapshots: Awaited<ReturnType<typeof getLearningMapSnapshots>>,
  curriculumId: string,
): string | null {
  const curriculum = snapshots.find((s) => s.curriculumId === curriculumId);

  if (!curriculum) {
    return null;
  }

  const allTopics = curriculum.modules.flatMap((m) => m.topics);

  if (allTopics.length === 0) {
    return null;
  }

  const interacted = allTopics.filter((t) => t.progress.lastInteractedAt);
  const pool = interacted.length > 0 ? interacted : allTopics;

  return [...pool].sort((a, b) =>
    (b.progress.lastInteractedAt ?? "").localeCompare(a.progress.lastInteractedAt ?? ""),
  )[0]!.id;
}

export async function getCurriculumStats(
  curriculumId: string,
): Promise<CurriculumStats | { error: StatsError }> {
  const detail = await getCurriculumDetail(curriculumId);

  if (!detail) {
    return { error: "not_found" };
  }

  const allTopics = summarizeTopics(detail);
  const attemptedTopicCount = allTopics.filter((t) => t.attempts > 0).length;
  const weakSpots = weakSpotsOf(allTopics);
  const strongPoints = strongPointsOf(allTopics);

  const [recommendations, snapshots] = await Promise.all([
    getRecommendationsForTopics(weakSpots.map((w) => w.topicId)),
    getLearningMapSnapshots(),
  ]);

  const anchorTopicId = mostRecentlyStudiedTopicId(snapshots, curriculumId);
  const nextStep = anchorTopicId ? nextStepRecommendation(snapshots, anchorTopicId) : null;

  return {
    curriculumId,
    attemptedTopicCount,
    weakSpots: weakSpots.map((w) => ({
      topicId: w.topicId,
      topicTitle: w.topicTitle,
      maturity: w.maturity,
      openGapLabels: w.openGapLabels,
    })),
    strongPoints: strongPoints.map((s) => ({
      topicId: s.topicId,
      topicTitle: s.topicTitle,
      maturity: s.maturity,
    })),
    recommendationsEligible: attemptedTopicCount >= RECOMMENDATION_ELIGIBILITY_THRESHOLD,
    recommendations,
    nextStep,
  };
}

export async function generateRecommendations(
  curriculumId: string,
  now: string,
): Promise<GenerateRecommendationsResult | { error: StatsError }> {
  const detail = await getCurriculumDetail(curriculumId);

  if (!detail) {
    return { error: "not_found" };
  }

  const allTopics = summarizeTopics(detail);
  const attemptedTopicCount = allTopics.filter((t) => t.attempts > 0).length;

  if (attemptedTopicCount < RECOMMENDATION_ELIGIBILITY_THRESHOLD) {
    return { recommendations: [], failed: false };
  }

  const weakSpots = weakSpotsOf(allTopics);

  const outcomes = await Promise.all(
    weakSpots.map(async (topic) => {
      const prompt = [
        `Recommend concise further reading for a learner studying: ${topic.topicTitle}.`,
        topic.openGapLabels.length > 0
          ? `They are specifically weak on: ${topic.openGapLabels.join(", ")}.`
          : "",
        `Give one short, actionable recommendation (2-3 sentences), no question, no fabricated links.`,
      ]
        .filter(Boolean)
        .join(" ");

      const outcome = await webSearch(prompt, "stats.recommendation", {
        topicId: topic.topicId,
        topicTitle: topic.topicTitle,
      });

      if (!outcome.ok || outcome.text.length === 0) {
        log.warn({ topicId: topic.topicId, curriculumId }, "stats_recommendation_failed");
        return null;
      }

      return saveRecommendation(topic.topicId, outcome.text, outcome.citations, now);
    }),
  );

  const recommendations = outcomes.filter((r): r is NonNullable<typeof r> => r !== null);

  return { recommendations, failed: weakSpots.length > 0 && recommendations.length === 0 };
}
