import { describe, expect, it } from "vitest";
import { cardCaseQuoteIsValid, NOTHING_EXTRACTED_EVAL_CASES } from "./knowledge-bit-nothing-extracted-eval.fixture.js";

describe("nothing-extracted eval fixtures", () => {
  it("should hold valuable short notes whose supporting quote would pass validation, so a card is reachable", () => {
    const cardCases = NOTHING_EXTRACTED_EVAL_CASES.filter((testCase) => testCase.expectation === "card");

    expect(cardCases.length).toBeGreaterThanOrEqual(3);
    expect(cardCases.every(cardCaseQuoteIsValid)).toBe(true);
  });

  it("should hold filler cases with no quote that could support a lesson", () => {
    const nothingCases = NOTHING_EXTRACTED_EVAL_CASES.filter((testCase) => testCase.expectation === "nothing");

    expect(nothingCases.length).toBeGreaterThanOrEqual(3);
    expect(nothingCases.some((testCase) => testCase.supportingQuote)).toBe(false);
  });
});
