import { describe, it, expect } from "vitest";
import type { Module, Topic } from "@post-anki/shared";
import { deriveTopicStatus, moduleProgress, curriculumProgress } from "./progress";

function topic(overrides: Partial<Topic> & { id: string }): Topic {
  return {
    moduleId: "mod-1",
    title: "T",
    order: 1,
    included: true,
    selfGrade: null,
    depth: "working",
    learningStatus: "not_started",
    questions: [],
    progress: {
      status: "not_started",
      maturity: 0,
      attempts: 0,
      lastInteractedAt: null,
    },
    ...overrides,
  };
}

describe("deriveTopicStatus", () => {
  it("treats an untouched topic as not started", () => {
    expect(deriveTopicStatus(0, 0)).toBe("not_started");
  });

  it("marks a topic mastered once maturity crosses the mastery threshold", () => {
    expect(deriveTopicStatus(80, 3)).toBe("mastered");
  });

  it("keeps a partially-known topic in progress", () => {
    expect(deriveTopicStatus(40, 2)).toBe("in_progress");
  });

  it("counts an attempt with zero maturity as engaged, not untouched", () => {
    expect(deriveTopicStatus(0, 1)).toBe("in_progress");
  });
});

describe("moduleProgress", () => {
  it("ignores topics the learner opted out of", () => {
    const topics = [
      topic({ id: "a", included: true, progress: { status: "mastered", maturity: 90, attempts: 2, lastInteractedAt: "t" } }),
      topic({ id: "b", included: false, progress: { status: "in_progress", maturity: 10, attempts: 1, lastInteractedAt: "t" } }),
    ];

    expect(moduleProgress(topics)).toEqual({
      topicsIncluded: 1,
      topicsMastered: 1,
      percent: 90,
    });
  });

  it("reports zero progress for an empty module", () => {
    expect(moduleProgress([])).toEqual({
      topicsIncluded: 0,
      topicsMastered: 0,
      percent: 0,
    });
  });

  it("averages maturity across included topics", () => {
    const topics = [
      topic({ id: "a", progress: { status: "in_progress", maturity: 20, attempts: 1, lastInteractedAt: "t" } }),
      topic({ id: "b", progress: { status: "in_progress", maturity: 40, attempts: 1, lastInteractedAt: "t" } }),
    ];

    expect(moduleProgress(topics).percent).toBe(30);
  });
});

describe("curriculumProgress", () => {
  it("rolls module topics up into one curriculum-level figure", () => {
    const modules: Module[] = [
      {
        id: "m1",
        curriculumId: "c1",
        title: "M1",
        order: 1,
        learningStatus: "not_started",
        progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
        topics: [
          topic({ id: "a", moduleId: "m1", progress: { status: "mastered", maturity: 100, attempts: 4, lastInteractedAt: "t" } }),
        ],
      },
      {
        id: "m2",
        curriculumId: "c1",
        title: "M2",
        order: 2,
        learningStatus: "not_started",
        progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
        topics: [
          topic({ id: "b", moduleId: "m2", progress: { status: "not_started", maturity: 0, attempts: 0, lastInteractedAt: null } }),
        ],
      },
    ];

    expect(curriculumProgress(modules)).toEqual({
      topicsIncluded: 2,
      topicsMastered: 1,
      percent: 50,
    });
  });
});
