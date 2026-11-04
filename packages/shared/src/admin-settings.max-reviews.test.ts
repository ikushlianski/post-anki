import { describe, expect, it } from "vitest";
import { clampMaxReviewsPerDay, maxReviewsPerDaySchema, updateAdminSettingsInput } from "./admin-settings";

describe("daily review limit contract", () => {
  it.each([
    [0, 0],
    [-5, 0],
    [200, 200],
    [20000, 9999],
    [12.6, 13],
  ])("should turn a typed %s into the allowed value %s", (typed, allowed) => {
    expect(clampMaxReviewsPerDay(typed)).toBe(allowed);
  });

  it("should fall back to 200 when the typed value is not a number", () => {
    expect(clampMaxReviewsPerDay(Number.NaN)).toBe(200);
  });

  it("should keep 0 as the unlimited value in a settings update", () => {
    expect(updateAdminSettingsInput.parse({ maxReviewsPerDay: 0 }).maxReviewsPerDay).toBe(0);
    expect(maxReviewsPerDaySchema.safeParse(1.5).success).toBe(false);
  });
});
