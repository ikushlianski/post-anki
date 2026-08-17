import { describe, it, expect } from "vitest";
import { buildMasteryBreakdown } from "./mastery-breakdown";

describe("buildMasteryBreakdown", () => {
  it("joins gap durations and retention through topic to their mapped Area", () => {
    const result = buildMasteryBreakdown({
      gapDurations: [
        { gapId: "gap-1", hours: 10 },
        { gapId: "gap-2", hours: 30 },
      ],
      gapRetentions: [
        { gapId: "gap-1", correctCount: 1, totalCount: 1, rate: 1 },
        { gapId: "gap-2", correctCount: 0, totalCount: 2, rate: 0 },
      ],
      gapTopics: [
        { gapId: "gap-1", topicId: "topic-effects" },
        { gapId: "gap-2", topicId: "topic-effects" },
      ],
      topicAreas: [{ topicId: "topic-effects", areaId: "react-effects" }],
    });

    expect(result.byTopic).toEqual([
      {
        key: "topic-effects",
        timeToMastery: { count: 2, avgHours: 20, medianHours: 20 },
        retention: { count: 2, avgRate: 0.5, medianRate: 0.5 },
      },
    ]);
    expect(result.byArea).toEqual([
      {
        key: "react-effects",
        timeToMastery: { count: 2, avgHours: 20, medianHours: 20 },
        retention: { count: 2, avgRate: 0.5, medianRate: 0.5 },
      },
    ]);
  });

  it("drops a gap's contribution when its topic has no confirmed Area mapping, still keeping the topic bucket", () => {
    const result = buildMasteryBreakdown({
      gapDurations: [{ gapId: "gap-1", hours: 5 }],
      gapRetentions: [],
      gapTopics: [{ gapId: "gap-1", topicId: "topic-unmapped" }],
      topicAreas: [],
    });

    expect(result.byTopic).toEqual([
      { key: "topic-unmapped", timeToMastery: { count: 1, avgHours: 5, medianHours: 5 }, retention: null },
    ]);
    expect(result.byArea).toEqual([]);
  });

  it("does not double-count a gap's contribution when the same topic-Area pair appears twice (a duplicate confirmed mapping row)", () => {
    const result = buildMasteryBreakdown({
      gapDurations: [{ gapId: "gap-1", hours: 10 }],
      gapRetentions: [],
      gapTopics: [{ gapId: "gap-1", topicId: "topic-effects" }],
      topicAreas: [
        { topicId: "topic-effects", areaId: "react-effects" },
        { topicId: "topic-effects", areaId: "react-effects" },
      ],
    });

    expect(result.byArea).toEqual([
      { key: "react-effects", timeToMastery: { count: 1, avgHours: 10, medianHours: 10 }, retention: null },
    ]);
  });

  it("ignores a duration/retention entry for a gap with no known topic link", () => {
    const result = buildMasteryBreakdown({
      gapDurations: [{ gapId: "orphan-gap", hours: 5 }],
      gapRetentions: [],
      gapTopics: [],
      topicAreas: [],
    });

    expect(result.byTopic).toEqual([]);
    expect(result.byArea).toEqual([]);
  });
});
