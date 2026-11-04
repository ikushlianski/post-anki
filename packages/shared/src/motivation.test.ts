import { describe, expect, it } from "vitest";
import { pauseStreakInput, updateMotivationSettingsInput, motivationProgressQuery } from "./motivation";

describe("updateMotivationSettingsInput", () => {
  it("should accept a real time zone and reject an invented one", () => {
    expect(updateMotivationSettingsInput.safeParse({ timeZone: "Europe/Berlin" }).success).toBe(true);
    expect(updateMotivationSettingsInput.safeParse({ timeZone: "Mars/Olympus" }).success).toBe(false);
  });

  it("should reject an empty update", () => {
    expect(updateMotivationSettingsInput.safeParse({}).success).toBe(false);
  });

  it("should allow turning rest days off but not setting the streak minimum to zero", () => {
    expect(updateMotivationSettingsInput.safeParse({ restDaysPerMonth: 0 }).success).toBe(true);
    expect(updateMotivationSettingsInput.safeParse({ streakMinReviews: 0 }).success).toBe(false);
  });
});

describe("pauseStreakInput", () => {
  it("should allow ending a pause with zero days and cap a pause at a month", () => {
    expect(pauseStreakInput.safeParse({ days: 0 }).success).toBe(true);
    expect(pauseStreakInput.safeParse({ days: 31 }).success).toBe(false);
  });
});

describe("motivationProgressQuery", () => {
  it("should default to about four months of history and cap the range", () => {
    expect(motivationProgressQuery.parse({}).days).toBe(120);
    expect(motivationProgressQuery.safeParse({ days: "400" }).success).toBe(false);
  });
});
