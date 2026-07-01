import { describe, it, expect } from "vitest";
import { planModuleQuizDistribution } from "./module-plan";

describe("planModuleQuizDistribution", () => {
  it("returns an empty plan when there are no topics", () => {
    expect(planModuleQuizDistribution([], 16)).toEqual({
      perTopic: [],
      integrative: 0,
      total: 0,
    });
  });

  it("treats a single-topic module like a topic-scoped quiz", () => {
    expect(planModuleQuizDistribution(["a"], 8)).toEqual({
      perTopic: [{ topicId: "a", count: 8 }],
      integrative: 0,
      total: 8,
    });
  });

  it("covers every included topic with at least one question", () => {
    const plan = planModuleQuizDistribution(["a", "b", "c", "d"], 16);

    expect(plan.perTopic).toHaveLength(4);
    plan.perTopic.forEach((slot) => {
      expect(slot.count).toBeGreaterThanOrEqual(1);
      expect(slot.count).toBeLessThanOrEqual(2);
    });
  });

  it("reserves at least one integrative cross-topic question for multi-topic modules", () => {
    expect(planModuleQuizDistribution(["a", "b", "c"], 10).integrative).toBeGreaterThanOrEqual(1);
  });

  it("still covers every topic when the target is tight", () => {
    const plan = planModuleQuizDistribution(["a", "b", "c", "d"], 4);

    plan.perTopic.forEach((slot) => expect(slot.count).toBeGreaterThanOrEqual(1));
    expect(plan.integrative).toBeGreaterThanOrEqual(1);
  });

  it("gives the second question to the earliest topics first", () => {
    const plan = planModuleQuizDistribution(["a", "b", "c"], 8);

    expect(plan.perTopic[0]!.count).toBe(2);
  });
});
