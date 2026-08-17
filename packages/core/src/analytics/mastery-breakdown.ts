import { aggregateTimeToMastery, type GapTimeToMastery, type KeyedGapDuration, type TimeToMasterySummary } from "./gap-time-to-mastery";
import { aggregateRetentionRate, type GapRetention, type KeyedGapRetention, type RetentionSummary } from "./retention-rate";

export interface GapTopicLink {
  gapId: string;
  topicId: string;
}

export interface TopicAreaLink {
  topicId: string;
  areaId: string;
}

export interface MasteryBreakdownEntry {
  key: string;
  timeToMastery: TimeToMasterySummary | null;
  retention: RetentionSummary | null;
}

export interface MasteryBreakdown {
  byTopic: MasteryBreakdownEntry[];
  byArea: MasteryBreakdownEntry[];
}

export function buildMasteryBreakdown(input: {
  gapDurations: GapTimeToMastery[];
  gapRetentions: GapRetention[];
  gapTopics: GapTopicLink[];
  topicAreas: TopicAreaLink[];
}): MasteryBreakdown {
  const topicIdByGapId = new Map(input.gapTopics.map((link) => [link.gapId, link.topicId]));
  const areaIdsByTopicId = new Map<string, string[]>();

  for (const link of input.topicAreas) {
    const list = areaIdsByTopicId.get(link.topicId) ?? [];

    if (!list.includes(link.areaId)) {
      list.push(link.areaId);
    }

    areaIdsByTopicId.set(link.topicId, list);
  }

  const topicKeys = [...new Set(input.gapTopics.map((link) => link.topicId))];
  const areaKeys = [...new Set(input.topicAreas.map((link) => link.areaId))];

  const durationsByTopic: KeyedGapDuration[] = [];
  const durationsByArea: KeyedGapDuration[] = [];

  for (const duration of input.gapDurations) {
    const topicId = topicIdByGapId.get(duration.gapId);

    if (topicId === undefined) {
      continue;
    }

    durationsByTopic.push({ key: topicId, hours: duration.hours });

    for (const areaId of areaIdsByTopicId.get(topicId) ?? []) {
      durationsByArea.push({ key: areaId, hours: duration.hours });
    }
  }

  const retentionsByTopic: KeyedGapRetention[] = [];
  const retentionsByArea: KeyedGapRetention[] = [];

  for (const retention of input.gapRetentions) {
    const topicId = topicIdByGapId.get(retention.gapId);

    if (topicId === undefined) {
      continue;
    }

    retentionsByTopic.push({ key: topicId, rate: retention.rate });

    for (const areaId of areaIdsByTopicId.get(topicId) ?? []) {
      retentionsByArea.push({ key: areaId, rate: retention.rate });
    }
  }

  const timeToMasteryByTopic = aggregateTimeToMastery(durationsByTopic, topicKeys);
  const timeToMasteryByArea = aggregateTimeToMastery(durationsByArea, areaKeys);
  const retentionByTopic = aggregateRetentionRate(retentionsByTopic, topicKeys);
  const retentionByArea = aggregateRetentionRate(retentionsByArea, areaKeys);

  return {
    byTopic: topicKeys.map((key) => ({
      key,
      timeToMastery: timeToMasteryByTopic.get(key) ?? null,
      retention: retentionByTopic.get(key) ?? null,
    })),
    byArea: areaKeys.map((key) => ({
      key,
      timeToMastery: timeToMasteryByArea.get(key) ?? null,
      retention: retentionByArea.get(key) ?? null,
    })),
  };
}
