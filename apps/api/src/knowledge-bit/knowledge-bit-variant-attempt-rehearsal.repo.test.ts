import { describe, expect, it } from "vitest";
import { rehearsalVerdict } from "./knowledge-bit-variant-attempt-rehearsal.repo.js";

describe("rehearsalVerdict", () => {
  it("should count good and easy as a pass and again and hard as needing review", () => {
    expect(rehearsalVerdict("good")).toBe("Ok");
    expect(rehearsalVerdict("easy")).toBe("Ok");
    expect(rehearsalVerdict("hard")).toBe("NeedsReview");
    expect(rehearsalVerdict("again")).toBe("NeedsReview");
  });
});
