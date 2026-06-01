import { describe, it, expect } from "vitest";
import type { LearningStatus, Module, Topic } from "@post-anki/shared";
import {
  rollUpLearningStatus,
  moduleLearningStatus,
  curriculumLearningStatus,
} from "./learning-status";

function topic(id: string, learningStatus: LearningStatus, included = true): Topic {
  return {
    id,
    moduleId: "m",
    title: "T",
    order: 1,
    included,
    selfGrade: null,
    depth: "working",
    learningStatus,
    questions: [],
    progress: { status: "not_started", maturity: 0, attempts: 0, lastInteractedAt: null },
  };
}

describe("rollUpLearningStatus", () => {
  it("is not_started when there are no children at all", () => {
    expect(rollUpLearningStatus([])).toBe("not_started");
  });

  it("is not_started when every child is untouched", () => {
    expect(rollUpLearningStatus(["not_started", "not_started"])).toBe("not_started");
  });

  it("surfaces an active probe above everything else", () => {
    expect(rollUpLearningStatus(["done", "probing", "not_started"])).toBe("probing");
  });

  it("reports done only when every non-skipped child is done", () => {
    expect(rollUpLearningStatus(["done", "done"])).toBe("done");
  });

  it("treats a fully-skipped parent as skipping, not done", () => {
    expect(rollUpLearningStatus(["skipping", "skipping"])).toBe("skipping");
  });

  it("ignores skipped children when judging completion", () => {
    expect(rollUpLearningStatus(["done", "skipping"])).toBe("done");
  });

  it("falls back to probing for a genuinely mixed in-progress parent", () => {
    expect(rollUpLearningStatus(["done", "not_started"])).toBe("probing");
  });

  it("reports going_deeper when that is the most active state", () => {
    expect(rollUpLearningStatus(["going_deeper", "done"])).toBe("going_deeper");
  });

  it("reports reviewing when revisiting completed work", () => {
    expect(rollUpLearningStatus(["reviewing", "done"])).toBe("reviewing");
  });
});

describe("moduleLearningStatus", () => {
  it("rolls up only the topics the learner kept in scope", () => {
    const topics = [
      topic("a", "done"),
      topic("b", "probing", false),
    ];

    expect(moduleLearningStatus(topics)).toBe("done");
  });
});

describe("curriculumLearningStatus", () => {
  it("rolls module statuses into one curriculum-level headline", () => {
    const modules: Module[] = [
      { id: "m1", curriculumId: "c", title: "M1", order: 1, learningStatus: "done", topics: [], progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 } },
      { id: "m2", curriculumId: "c", title: "M2", order: 2, learningStatus: "probing", topics: [], progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 } },
    ];

    expect(curriculumLearningStatus(modules)).toBe("probing");
  });
});
