import { describe, it, expect } from "vitest";
import { aggregateTimeToMastery, deriveGapTimeToMastery } from "./gap-time-to-mastery";

describe("deriveGapTimeToMastery", () => {
  it("computes hours between createdAt and masteredAt for a mastered gap", () => {
    const result = deriveGapTimeToMastery([
      { gapId: "gap-1", createdAt: "2026-08-01T00:00:00.000Z", masteredAt: "2026-08-03T00:00:00.000Z" },
    ]);

    expect(result).toEqual([{ gapId: "gap-1", hours: 48 }]);
  });

  it("reports null hours for a gap not yet mastered, never zero", () => {
    const result = deriveGapTimeToMastery([
      { gapId: "gap-2", createdAt: "2026-08-01T00:00:00.000Z", masteredAt: null },
    ]);

    expect(result).toEqual([{ gapId: "gap-2", hours: null }]);
  });
});

describe("aggregateTimeToMastery", () => {
  it("groups durations by an external key such as topicId or domainNodeId", () => {
    const result = aggregateTimeToMastery(
      [
        { key: "topic-react", hours: 10 },
        { key: "topic-react", hours: 30 },
        { key: "topic-node", hours: 5 },
      ],
      ["topic-react", "topic-node"],
    );

    expect(result.get("topic-react")).toEqual({ count: 2, avgHours: 20, medianHours: 20 });
    expect(result.get("topic-node")).toEqual({ count: 1, avgHours: 5, medianHours: 5 });
  });

  it("reports null, not an error, for a topic with zero mastered gaps", () => {
    const result = aggregateTimeToMastery(
      [{ key: "topic-react", hours: 10 }],
      ["topic-react", "topic-empty"],
    );

    expect(result.get("topic-empty")).toBeNull();
  });

  it("excludes not-yet-mastered gaps (null hours) from the aggregate instead of counting them as zero", () => {
    const result = aggregateTimeToMastery(
      [
        { key: "topic-react", hours: 10 },
        { key: "topic-react", hours: null },
      ],
      ["topic-react"],
    );

    expect(result.get("topic-react")).toEqual({ count: 1, avgHours: 10, medianHours: 10 });
  });
});
