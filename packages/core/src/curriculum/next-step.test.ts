import { describe, it, expect } from "vitest";
import type { LearningMapSnapshot, LearningMapModuleSnapshot } from "@post-anki/shared";
import { nextStepRecommendation } from "./next-step";

function topic(
  id: string,
  overrides: Partial<LearningMapModuleSnapshot["topics"][number]["progress"]> = {},
): LearningMapModuleSnapshot["topics"][number] {
  return {
    id,
    title: `Topic ${id}`,
    progress: {
      status: "mastered",
      maturity: 100,
      attempts: 3,
      lastInteractedAt: null,
      ...overrides,
    },
  };
}

function module(overrides: Partial<LearningMapModuleSnapshot> = {}): LearningMapModuleSnapshot {
  return {
    level: null,
    progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
    topics: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<LearningMapSnapshot> = {}): LearningMapSnapshot {
  return {
    curriculumId: "cur-1",
    curriculumName: "Statistics",
    subjectName: "Math",
    learningStatus: "probing",
    percent: 0,
    lastInteractedAt: null,
    modules: [],
    ...overrides,
  };
}

describe("nextStepRecommendation", () => {
  it("recommends the same curriculum's next-level module once the current-level module is fully mastered", () => {
    const basicTopic = topic("t-basic", { status: "mastered", maturity: 100 });
    const mediumTopic = topic("t-medium", { status: "not_started", maturity: 0 });

    const snapshots = [
      snapshot({
        curriculumId: "cur-1",
        modules: [
          module({
            level: "basic",
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [basicTopic],
          }),
          module({
            level: "medium",
            progress: { topicsIncluded: 1, topicsMastered: 0, percent: 0 },
            topics: [mediumTopic],
          }),
        ],
      }),
    ];

    const result = nextStepRecommendation(snapshots, "t-basic");

    expect(result).toEqual({
      kind: "next_level",
      curriculumId: "cur-1",
      level: "medium",
      topicId: "t-medium",
    });
  });

  it("picks the lowest higher level when multiple higher-level modules exist", () => {
    const basicTopic = topic("t-basic", { status: "mastered", maturity: 100 });
    const mediumTopic = topic("t-medium", { status: "not_started", maturity: 0 });
    const advancedTopic = topic("t-advanced", { status: "not_started", maturity: 0 });

    const snapshots = [
      snapshot({
        curriculumId: "cur-1",
        modules: [
          module({
            level: "basic",
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [basicTopic],
          }),
          module({
            level: "advanced",
            progress: { topicsIncluded: 1, topicsMastered: 0, percent: 0 },
            topics: [advancedTopic],
          }),
          module({
            level: "medium",
            progress: { topicsIncluded: 1, topicsMastered: 0, percent: 0 },
            topics: [mediumTopic],
          }),
        ],
      }),
    ];

    const result = nextStepRecommendation(snapshots, "t-basic");

    expect(result).toEqual({
      kind: "next_level",
      curriculumId: "cur-1",
      level: "medium",
      topicId: "t-medium",
    });
  });

  it("still points at the next-level module even when its topics are not yet included in the display list", () => {
    const basicTopic = topic("t-basic", { status: "mastered", maturity: 100 });
    const mediumTopic = topic("t-medium", { status: "not_started", maturity: 0 });

    const snapshots = [
      snapshot({
        curriculumId: "cur-1",
        modules: [
          module({
            level: "basic",
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [basicTopic],
          }),
          module({
            level: "medium",
            progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
            topics: [mediumTopic],
          }),
        ],
      }),
    ];

    const result = nextStepRecommendation(snapshots, "t-basic");

    expect(result).toEqual({
      kind: "next_level",
      curriculumId: "cur-1",
      level: "medium",
      topicId: "t-medium",
    });
  });

  it("falls back to the weakest not-yet-mastered topic elsewhere when no higher-level module exists in the same curriculum", () => {
    const onlyTopic = topic("t-only", { status: "mastered", maturity: 100 });
    const weakTopic = topic("t-weak", { status: "in_progress", maturity: 20 });
    const strongerTopic = topic("t-strong", { status: "in_progress", maturity: 60 });

    const snapshots = [
      snapshot({
        curriculumId: "cur-1",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [onlyTopic],
          }),
        ],
      }),
      snapshot({
        curriculumId: "cur-2",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 2, topicsMastered: 0, percent: 40 },
            topics: [strongerTopic, weakTopic],
          }),
        ],
      }),
    ];

    const result = nextStepRecommendation(snapshots, "t-only");

    expect(result).toEqual({ kind: "different_topic", topicId: "t-weak" });
  });

  it("never falls back to a topic that is already mastered", () => {
    const onlyTopic = topic("t-only", { status: "mastered", maturity: 100 });
    const masteredElsewhere = topic("t-mastered", { status: "mastered", maturity: 100 });
    const inProgress = topic("t-progress", { status: "in_progress", maturity: 50 });

    const snapshots = [
      snapshot({
        curriculumId: "cur-1",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [onlyTopic],
          }),
        ],
      }),
      snapshot({
        curriculumId: "cur-2",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 2, topicsMastered: 1, percent: 75 },
            topics: [masteredElsewhere, inProgress],
          }),
        ],
      }),
    ];

    const result = nextStepRecommendation(snapshots, "t-only");

    expect(result).toEqual({ kind: "different_topic", topicId: "t-progress" });
  });

  it("returns null when literally everything everywhere is mastered", () => {
    const onlyTopic = topic("t-only", { status: "mastered", maturity: 100 });
    const otherTopic = topic("t-other", { status: "mastered", maturity: 100 });

    const snapshots = [
      snapshot({
        curriculumId: "cur-1",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [onlyTopic],
          }),
        ],
      }),
      snapshot({
        curriculumId: "cur-2",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [otherTopic],
          }),
        ],
      }),
    ];

    const result = nextStepRecommendation(snapshots, "t-only");

    expect(result).toBeNull();
  });

  it("falls back to a different topic when the completed topic's curriculum has zero level tiers", () => {
    const completedTopic = topic("t-basic", { status: "mastered", maturity: 100 });
    const weakTopic = topic("t-weak", { status: "in_progress", maturity: 10 });

    const snapshots = [
      snapshot({
        curriculumId: "cur-1",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 1, topicsMastered: 1, percent: 100 },
            topics: [completedTopic],
          }),
        ],
      }),
      snapshot({
        curriculumId: "cur-2",
        modules: [
          module({
            level: null,
            progress: { topicsIncluded: 1, topicsMastered: 0, percent: 10 },
            topics: [weakTopic],
          }),
        ],
      }),
    ];

    const result = nextStepRecommendation(snapshots, "t-basic");

    expect(result).toEqual({ kind: "different_topic", topicId: "t-weak" });
  });
});
