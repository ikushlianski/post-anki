import type {
  Module,
  ModuleProgress,
  Topic,
  TopicProgressStatus,
} from "@post-anki/shared";

const MASTERY_THRESHOLD = 80;

export function deriveTopicStatus(
  maturity: number,
  attempts: number,
): TopicProgressStatus {
  if (attempts === 0 && maturity === 0) {
    return "not_started";
  }

  if (maturity >= MASTERY_THRESHOLD) {
    return "mastered";
  }

  return "in_progress";
}

export { MASTERY_THRESHOLD };

export function moduleProgress(topics: Topic[]): ModuleProgress {
  const included = topics.filter((t) => t.included);
  const topicsIncluded = included.length;
  const topicsMastered = included.filter(
    (t) => t.progress.status === "mastered",
  ).length;

  const percent =
    topicsIncluded === 0
      ? 0
      : Math.round(
          included.reduce((sum, t) => sum + t.progress.maturity, 0) /
            topicsIncluded,
        );

  return { topicsIncluded, topicsMastered, percent };
}

export function curriculumProgress(modules: Module[]): ModuleProgress {
  return moduleProgress(modules.flatMap((m) => m.topics));
}
