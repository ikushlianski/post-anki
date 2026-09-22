import { describe, expect, it } from "vitest";
import { isPaTagged } from "./is-pa-tagged.js";

describe("isPaTagged", () => {
  it("recognizes a row tagged PA", () => {
    expect(isPaTagged(["todo", "PA"])).toBe(true);
  });

  it("recognizes a lowercase pa tag", () => {
    expect(isPaTagged(["pa"])).toBe(true);
  });

  it("ignores a row with unrelated tags only", () => {
    expect(isPaTagged(["CRM", "BA"])).toBe(false);
  });

  it("ignores a row with no tags", () => {
    expect(isPaTagged([])).toBe(false);
  });
});
