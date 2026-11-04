import { describe, expect, it } from "vitest";
import { resolveRoute } from "../router.js";

describe("motivation routes", () => {
  it("should resolve the read models the home, session end and progress screens need", () => {
    expect(resolveRoute("GET", "/motivation/today")?.name).toBe("getMotivationToday");
    expect(resolveRoute("GET", "/motivation/session-summary")?.name).toBe("getMotivationSessionSummary");
    expect(resolveRoute("GET", "/motivation/progress")?.name).toBe("getMotivationProgress");
    expect(resolveRoute("GET", "/motivation/weekly-summary")?.name).toBe("getMotivationWeeklySummary");
  });

  it("should resolve streak reading and pausing separately", () => {
    expect(resolveRoute("GET", "/motivation/streak")?.name).toBe("getGoalStreak");
    expect(resolveRoute("PUT", "/motivation/streak/pause")?.name).toBe("pauseGoalStreak");
  });

  it("should resolve reading and changing settings", () => {
    expect(resolveRoute("GET", "/motivation/settings")?.name).toBe("getMotivationSettings");
    expect(resolveRoute("PUT", "/motivation/settings")?.name).toBe("putMotivationSettings");
  });

  it("should not allow writing a read model", () => {
    expect(resolveRoute("POST", "/motivation/today")).toBeNull();
    expect(resolveRoute("PUT", "/motivation/progress")).toBeNull();
  });
});
