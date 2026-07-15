import type { LearningMapModuleSnapshot, LearningMapSnapshot, LearningMapTopicSnapshot, Level } from "@post-anki/shared";
import { LEVEL_RANK } from "@post-anki/shared";

export type NextStepRecommendation =
  | { kind: "next_level"; curriculumId: string; level: Level; topicId: string }
  | { kind: "different_topic"; topicId: string }
  | null;

export function nextStepRecommendation(
  snapshots: LearningMapSnapshot[],
  completedTopicId: string,
): NextStepRecommendation {
  const home = findCompletedTopicHome(snapshots, completedTopicId);

  if (home && home.currentLevel !== null) {
    const nextLevelPick = pickNextLevelTopic(home.curriculum, home.currentLevel);

    if (nextLevelPick) {
      return {
        kind: "next_level",
        curriculumId: home.curriculum.curriculumId,
        level: nextLevelPick.level,
        topicId: nextLevelPick.topicId,
      };
    }
  }

  const fallbackTopicId = weakestUnmasteredTopicId(snapshots);

  return fallbackTopicId ? { kind: "different_topic", topicId: fallbackTopicId } : null;
}

function findCompletedTopicHome(
  snapshots: LearningMapSnapshot[],
  completedTopicId: string,
): { curriculum: LearningMapSnapshot; currentLevel: Level | null } | null {
  for (const curriculum of snapshots) {
    for (const mod of curriculum.modules) {
      if (mod.topics.some((t) => t.id === completedTopicId)) {
        return { curriculum, currentLevel: mod.level };
      }
    }
  }

  return null;
}

function isModuleFullyMastered(mod: LearningMapModuleSnapshot): boolean {
  return mod.progress.topicsIncluded > 0 && mod.progress.topicsIncluded === mod.progress.topicsMastered;
}

function pickNextLevelTopic(
  curriculum: LearningMapSnapshot,
  currentLevel: Level,
): { level: Level; topicId: string } | null {
  const currentLevelModules = curriculum.modules.filter((m) => m.level === currentLevel);

  if (!currentLevelModules.every(isModuleFullyMastered)) {
    return null;
  }

  const currentRank = LEVEL_RANK[currentLevel];
  const higherLevels = Array.from(
    new Set(
      curriculum.modules
        .filter((m) => m.level !== null && LEVEL_RANK[m.level] > currentRank)
        .map((m) => m.level as Level),
    ),
  ).sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b]);

  const nextLevel = higherLevels[0];

  if (!nextLevel) {
    return null;
  }

  const nextLevelTopics = curriculum.modules
    .filter((m) => m.level === nextLevel)
    .flatMap((m) => m.topics);

  const target = weakestTopic(nextLevelTopics) ?? nextLevelTopics[0];

  return target ? { level: nextLevel, topicId: target.id } : null;
}

function weakestUnmasteredTopicId(snapshots: LearningMapSnapshot[]): string | null {
  const candidates = snapshots
    .flatMap((s) => s.modules)
    .flatMap((m) => m.topics)
    .filter((t) => t.progress.status !== "mastered");

  return weakestTopic(candidates)?.id ?? null;
}

function weakestTopic(topics: LearningMapTopicSnapshot[]): LearningMapTopicSnapshot | null {
  if (topics.length === 0) {
    return null;
  }

  return [...topics].sort((a, b) => a.progress.maturity - b.progress.maturity)[0]!;
}
