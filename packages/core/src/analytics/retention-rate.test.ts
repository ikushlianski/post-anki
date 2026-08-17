import { describe, it, expect } from "vitest";
import { aggregateRetentionRate, deriveRetentionRate } from "./retention-rate";

describe("deriveRetentionRate", () => {
  it("only counts answers after the gap's mastery date toward retention", () => {
    const masteredAt = new Map([["gap-1", "2026-08-01T00:00:00.000Z"]]);
    const answers = [
      { gapId: "gap-1", answeredAt: "2026-07-30T00:00:00.000Z", outcome: "fail" as const },
      { gapId: "gap-1", answeredAt: "2026-08-05T00:00:00.000Z", outcome: "pass" as const },
    ];

    const result = deriveRetentionRate(answers, masteredAt);

    expect(result).toEqual([{ gapId: "gap-1", correctCount: 1, totalCount: 1, rate: 1 }]);
  });

  it("reports null retention, not 0%, for a gap with zero post-mastery answers", () => {
    const masteredAt = new Map([["gap-2", "2026-08-01T00:00:00.000Z"]]);

    const result = deriveRetentionRate([], masteredAt);

    expect(result).toEqual([{ gapId: "gap-2", correctCount: 0, totalCount: 0, rate: null }]);
  });

  it("excludes an answer exactly at the mastery timestamp, not just before it", () => {
    const masteredAt = new Map([["gap-3", "2026-08-01T00:00:00.000Z"]]);
    const answers = [{ gapId: "gap-3", answeredAt: "2026-08-01T00:00:00.000Z", outcome: "pass" as const }];

    const result = deriveRetentionRate(answers, masteredAt);

    expect(result).toEqual([{ gapId: "gap-3", correctCount: 0, totalCount: 0, rate: null }]);
  });

  it("ignores an answer for a gap that has no gap_mastery row at all", () => {
    const result = deriveRetentionRate(
      [{ gapId: "untracked-gap", answeredAt: "2026-08-05T00:00:00.000Z", outcome: "pass" as const }],
      new Map(),
    );

    expect(result).toEqual([]);
  });
});

describe("aggregateRetentionRate", () => {
  it("aggregates per-gap retention rates the same way time-to-mastery aggregates durations", () => {
    const result = aggregateRetentionRate(
      [
        { key: "topic-react", rate: 1 },
        { key: "topic-react", rate: 0.5 },
      ],
      ["topic-react"],
    );

    expect(result.get("topic-react")).toEqual({ count: 2, avgRate: 0.75, medianRate: 0.75 });
  });

  it("reports null for a group where every gap has null (no post-mastery answers) retention", () => {
    const result = aggregateRetentionRate([{ key: "topic-react", rate: null }], ["topic-react"]);

    expect(result.get("topic-react")).toBeNull();
  });
});
