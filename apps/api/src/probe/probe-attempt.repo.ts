import type { DepthLevel, Gap, LearningStatus, TopicProgress } from "@post-anki/shared";
import { openGaps, progressFromGaps } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { insertDiscoveredGaps, persistGaps } from "../gap/gap.repo.js";
import { incrementTopicAttempts, writeTopicProgress } from "../topic/topic-progress.repo.js";

type DiscoveredGapInput = Parameters<typeof insertDiscoveredGaps>[1];

export interface ProbeAttemptWrite {
  topicId: string;
  depth: DepthLevel;
  updatedGaps: Gap[];
  newGaps: DiscoveredGapInput;
  now: string;
}

export interface ProbeAttemptOutcome {
  allGaps: Gap[];
  progress: TopicProgress;
  learningStatus: LearningStatus;
}

export async function recordProbeAttempt(input: ProbeAttemptWrite): Promise<ProbeAttemptOutcome> {
  return getDb().transaction(async (tx) => {
    const attempts = await incrementTopicAttempts(input.topicId, tx);

    await persistGaps(input.updatedGaps, tx);

    const discovered = await insertDiscoveredGaps(input.topicId, input.newGaps, input.now, tx);
    const allGaps = [...input.updatedGaps, ...discovered];
    const progress = progressFromGaps(allGaps, input.depth, attempts, input.now);
    const learningStatus: LearningStatus =
      openGaps(allGaps, input.depth).length === 0 ? "reviewing" : "probing";

    await writeTopicProgress(input.topicId, progress, learningStatus, tx);

    return { allGaps, progress, learningStatus };
  });
}
