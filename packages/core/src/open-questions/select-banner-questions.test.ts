import { describe, it, expect } from "vitest";
import { selectBannerQuestions } from "./select-banner-questions";

describe("selectBannerQuestions", () => {
  it("shows all rows and reports zero remaining when nothing is capped away", () => {
    const result = selectBannerQuestions(["a", "b"], 2, 3);

    expect(result.shown).toEqual(["a", "b"]);
    expect(result.remainingCount).toBe(0);
  });

  it("caps the shown rows at the limit even if more rows are passed in", () => {
    const result = selectBannerQuestions(["a", "b", "c", "d", "e"], 5, 3);

    expect(result.shown).toEqual(["a", "b", "c"]);
    expect(result.remainingCount).toBe(2);
  });

  it("reports zero remaining when there are no open questions at all", () => {
    const result = selectBannerQuestions([], 0, 3);

    expect(result.shown).toEqual([]);
    expect(result.remainingCount).toBe(0);
  });

  it("never reports a negative remaining count even if totalOpenCount undercounts the rows", () => {
    const result = selectBannerQuestions(["a", "b"], 1, 3);

    expect(result.remainingCount).toBe(0);
  });
});
