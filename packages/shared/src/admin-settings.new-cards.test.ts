import { describe, expect, it } from "vitest";
import {
  clampNewCardsPerDay,
  newCardsPerDayInputSchema,
  updateAdminSettingsInput,
} from "./admin-settings";

describe("daily new-card limit contract", () => {
  it.each([
    [0, 1],
    [-5, 1],
    [1, 1],
    [20, 20],
    [200, 200],
    [201, 200],
    [9999, 200],
    [12.6, 13],
  ])("should turn a typed %s into the allowed value %s", (typed, allowed) => {
    expect(clampNewCardsPerDay(typed)).toBe(allowed);
  });

  it("should fall back to 20 when the typed value is not a number", () => {
    expect(clampNewCardsPerDay(Number.NaN)).toBe(20);
  });

  it("should clamp the limit the learner sends in a settings update", () => {
    expect(updateAdminSettingsInput.parse({ newCardsPerDay: 500 }).newCardsPerDay).toBe(200);
    expect(newCardsPerDayInputSchema.parse(0)).toBe(1);
  });

  it("should reject a non-numeric limit in a settings update", () => {
    expect(updateAdminSettingsInput.safeParse({ newCardsPerDay: "lots" }).success).toBe(false);
  });
});
