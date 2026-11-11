import { describe, expect, it } from "vitest";
import { complexityLevelSchema, complexityRetention } from "./study-complexity";

describe("complexity levels", () => {
  it("should accept only Easy, Normal and Cram", () => {
    expect(complexityLevelSchema.safeParse("easy").success).toBe(true);
    expect(complexityLevelSchema.safeParse("hard").success).toBe(false);
  });

  it("should map Easy and Cram to fixed retention and Normal to the app default", () => {
    expect(complexityRetention("easy", 0.9)).toBe(0.87);
    expect(complexityRetention("cram", 0.9)).toBe(0.935);
    expect(complexityRetention("normal", 0.92)).toBe(0.92);
  });
});
