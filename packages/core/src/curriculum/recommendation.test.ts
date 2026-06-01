import { describe, it, expect } from "vitest";
import type { Module, Topic } from "@post-anki/shared";
import { recommendedTopicId } from "./recommendation";

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

function moduleOf(topics: Topic[]): Module {
  return {
    id: "m1",
    curriculumId: "c1",
    title: "M",
    order: 1,
    learningStatus: "not_started",
    progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
    topics,
  };
}

describe("recommendedTopicId", () => {
  it("points the learner at their weakest included topic first", () => {
    const modules = [
      moduleOf([
        topic({ id: "strong", progress: { status: "in_progress", maturity: 70, attempts: 2, lastInteractedAt: "t" } }),
        topic({ id: "weak", progress: { status: "in_progress", maturity: 10, attempts: 1, lastInteractedAt: "t" } }),
      ]),
    ];

    expect(recommendedTopicId(modules)).toBe("weak");
  });

  it("never recommends a mastered topic", () => {
    const modules = [
      moduleOf([
        topic({ id: "done", progress: { status: "mastered", maturity: 100, attempts: 5, lastInteractedAt: "t" } }),
      ]),
    ];

    expect(recommendedTopicId(modules)).toBeNull();
  });

  it("skips topics the learner opted out of", () => {
    const modules = [
      moduleOf([
        topic({ id: "out", included: false, progress: { status: "not_started", maturity: 0, attempts: 0, lastInteractedAt: null } }),
        topic({ id: "in", included: true, progress: { status: "in_progress", maturity: 50, attempts: 1, lastInteractedAt: "t" } }),
      ]),
    ];

    expect(recommendedTopicId(modules)).toBe("in");
  });

  it("breaks maturity ties by trusting the lower self-grade", () => {
    const modules = [
      moduleOf([
        topic({ id: "confident", selfGrade: 4, progress: { status: "in_progress", maturity: 30, attempts: 1, lastInteractedAt: "t" } }),
        topic({ id: "shaky", selfGrade: 1, progress: { status: "in_progress", maturity: 30, attempts: 1, lastInteractedAt: "t" } }),
      ]),
    ];

    expect(recommendedTopicId(modules)).toBe("shaky");
  });
});
