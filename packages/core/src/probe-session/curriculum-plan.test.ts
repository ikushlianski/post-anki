import { describe, it, expect } from "vitest";
import {
  CURRICULUM_QUIZ_MAX_TOTAL,
  CURRICULUM_QUIZ_MIN_TOTAL,
  planCurriculumQuizDistribution,
} from "./curriculum-plan";

describe("planCurriculumQuizDistribution", () => {
  it("returns an empty plan when there are no topics", () => {
    expect(planCurriculumQuizDistribution([])).toEqual({
      perTopic: [],
      integrative: 0,
      total: 0,
    });
  });

  it("gives every topic exactly one question when the topic count already sits in the 10-20 range", () => {
    const topics = Array.from({ length: 12 }, (_, i) => ({
      topicId: `t${i}`,
      priority: 0,
    }));

    const plan = planCurriculumQuizDistribution(topics);

    expect(plan.total).toBe(12);
    expect(plan.integrative).toBe(0);
    plan.perTopic.forEach((slot) => expect(slot.count).toBe(1));
  });

  it("never asks about a cross-topic integrative question", () => {
    const topics = Array.from({ length: 3 }, (_, i) => ({
      topicId: `t${i}`,
      priority: 0,
    }));

    expect(planCurriculumQuizDistribution(topics).integrative).toBe(0);
  });

  it("tops up to the 10-question floor when the curriculum has few topics", () => {
    const topics = [
      { topicId: "a", priority: 0 },
      { topicId: "b", priority: 0 },
      { topicId: "c", priority: 0 },
    ];

    const plan = planCurriculumQuizDistribution(topics);

    expect(plan.total).toBe(CURRICULUM_QUIZ_MIN_TOTAL);
    expect(plan.perTopic).toHaveLength(3);
  });

  it("gives extra questions to the highest-priority topics first", () => {
    const topics = [
      { topicId: "low", priority: -1 },
      { topicId: "high", priority: 1 },
      { topicId: "mid", priority: 0 },
    ];

    const plan = planCurriculumQuizDistribution(topics);
    const byId = new Map(plan.perTopic.map((slot) => [slot.topicId, slot.count]));

    expect(byId.get("high")).toBeGreaterThan(byId.get("low")!);
    expect(byId.get("high")).toBeGreaterThanOrEqual(byId.get("mid")!);
  });

  it("caps the batch at 20 questions and drops the lowest-priority topics beyond that", () => {
    const topics = Array.from({ length: 30 }, (_, i) => ({
      topicId: `t${i}`,
      priority: i < 20 ? 1 : -1,
    }));

    const plan = planCurriculumQuizDistribution(topics);
    const includedIds = new Set(plan.perTopic.map((slot) => slot.topicId));

    expect(plan.total).toBe(CURRICULUM_QUIZ_MAX_TOTAL);
    expect(plan.perTopic).toHaveLength(CURRICULUM_QUIZ_MAX_TOTAL);
    for (let i = 0; i < 20; i++) {
      expect(includedIds.has(`t${i}`)).toBe(true);
    }
    for (let i = 20; i < 30; i++) {
      expect(includedIds.has(`t${i}`)).toBe(false);
    }
  });

  it("gives every included topic exactly one question once the batch is capped at the max", () => {
    const topics = Array.from({ length: 25 }, (_, i) => ({
      topicId: `t${i}`,
      priority: 0,
    }));

    const plan = planCurriculumQuizDistribution(topics);

    plan.perTopic.forEach((slot) => expect(slot.count).toBe(1));
  });

  // exam-prep-mock-exam-session — a mock exam's fixed question count can
  // exceed the 20-question calibration ceiling; targetOverride replaces
  // both the 10-20 clamp and the topic cap so perTopic always sums to it.
  it("targetOverride replaces the 10-20 clamp with an exact count, even above 20", () => {
    const topics = Array.from({ length: 5 }, (_, i) => ({
      topicId: `t${i}`,
      priority: 0,
    }));

    const plan = planCurriculumQuizDistribution(topics, 30);

    expect(plan.total).toBe(30);
    expect(plan.perTopic.reduce((sum, slot) => sum + slot.count, 0)).toBe(30);
  });

  it("targetOverride below the topic count still only drops the lowest-priority topics, one each", () => {
    const topics = Array.from({ length: 15 }, (_, i) => ({
      topicId: `t${i}`,
      priority: i < 10 ? 1 : -1,
    }));

    const plan = planCurriculumQuizDistribution(topics, 10);

    expect(plan.total).toBe(10);
    expect(plan.perTopic).toHaveLength(10);
    plan.perTopic.forEach((slot) => expect(slot.count).toBe(1));
  });
});
