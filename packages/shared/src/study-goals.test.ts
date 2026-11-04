import { describe, expect, it } from "vitest";
import {
  createSubjectPriorityInput,
  putAddKnowledgeGoalInput,
  updateDailyGoalInput,
  updateSubjectPriorityInput,
} from "./study-goals";

const base = { periodKind: "week", periodKey: "2026-W44", title: "Postgres" };

describe("study goal input schemas", () => {
  it("should accept a text-only priority with no target", () => {
    const parsed = createSubjectPriorityInput.parse(base);

    expect(parsed.targetMetric).toBe("none");
    expect(parsed.targetValue).toBeNull();
  });

  it("should reject a period key that does not match the period kind", () => {
    expect(createSubjectPriorityInput.safeParse({ ...base, periodKey: "2026-10" }).success).toBe(false);
    expect(createSubjectPriorityInput.safeParse({ ...base, periodKind: "month", periodKey: "2026-13" }).success).toBe(false);
  });

  it("should reject a numeric target without a metric to count", () => {
    expect(createSubjectPriorityInput.safeParse({ ...base, targetValue: 5 }).success).toBe(false);
    expect(
      createSubjectPriorityInput.safeParse({ ...base, targetMetric: "reviews", targetValue: 200 }).success,
    ).toBe(true);
  });

  it("should reject an empty update", () => {
    expect(updateSubjectPriorityInput.safeParse({}).success).toBe(false);
    expect(updateSubjectPriorityInput.safeParse({ done: true }).success).toBe(true);
  });

  it("should allow clearing the daily goal with null but not setting zero", () => {
    expect(updateDailyGoalInput.safeParse({ dailyReviewTarget: null }).success).toBe(true);
    expect(updateDailyGoalInput.safeParse({ dailyReviewTarget: 0 }).success).toBe(false);
  });

  it("should default an add-knowledge goal to a weekly period", () => {
    expect(putAddKnowledgeGoalInput.parse({ subjectId: "s1", targetNotes: 5 }).period).toBe("week");
  });
});
