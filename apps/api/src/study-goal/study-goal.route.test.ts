import { describe, expect, it } from "vitest";
import { resolveRoute } from "../router.js";

describe("study goal routes", () => {
  it("should resolve priorities as a sub-resource of a subject and as top-level items", () => {
    expect(resolveRoute("GET", "/subjects/s1/priorities")).toEqual({ name: "listSubjectPriorities", params: { id: "s1" } });
    expect(resolveRoute("POST", "/subjects/s1/priorities")).toEqual({ name: "createSubjectPriority", params: { id: "s1" } });
    expect(resolveRoute("PATCH", "/priorities/p1")).toEqual({ name: "updateSubjectPriority", params: { id: "p1" } });
    expect(resolveRoute("DELETE", "/priorities/p1")).toEqual({ name: "deleteSubjectPriority", params: { id: "p1" } });
  });

  it("should resolve the current-period priorities list across subjects", () => {
    expect(resolveRoute("GET", "/priorities")?.name).toBe("listCurrentPriorities");
  });

  it("should resolve the daily goal and its progress", () => {
    expect(resolveRoute("GET", "/study-goal/daily")?.name).toBe("getDailyStudyGoal");
    expect(resolveRoute("PUT", "/study-goal/daily")?.name).toBe("putDailyStudyGoal");
    expect(resolveRoute("GET", "/study-goal/daily/progress")?.name).toBe("getDailyStudyGoalProgress");
  });

  it("should keep add-knowledge goal progress separate from deleting a goal by id", () => {
    expect(resolveRoute("GET", "/add-knowledge-goals/progress")?.name).toBe("listAddKnowledgeGoalProgress");
    expect(resolveRoute("DELETE", "/add-knowledge-goals/g1")).toEqual({ name: "deleteAddKnowledgeGoal", params: { id: "g1" } });
    expect(resolveRoute("PUT", "/add-knowledge-goals")?.name).toBe("putAddKnowledgeGoal");
  });

  it("should not resolve unsupported methods", () => {
    expect(resolveRoute("PUT", "/priorities/p1")).toBeNull();
    expect(resolveRoute("POST", "/study-goal/daily")).toBeNull();
  });
});
