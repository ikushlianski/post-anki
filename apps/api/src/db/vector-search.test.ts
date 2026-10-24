import { describe, expect, it } from "vitest";
import { MAX_EF_SEARCH, MIN_EF_SEARCH, SUBJECT_FILTERED_EF_SEARCH, efSearchFor } from "./vector-search.js";

describe("efSearchFor", () => {
  it("should search at least the default breadth so small top-K requests keep their recall", () => {
    expect(efSearchFor(5)).toBe(MIN_EF_SEARCH);
  });

  it("should widen the search when the caller asks for more results than the default breadth", () => {
    expect(efSearchFor(250)).toBe(250);
  });

  it("should search wider when results are filtered by subject so the filter does not starve the result list", () => {
    expect(efSearchFor(10, true)).toBe(SUBJECT_FILTERED_EF_SEARCH);
  });

  it("should never exceed the pgvector maximum", () => {
    expect(efSearchFor(50_000, true)).toBe(MAX_EF_SEARCH);
  });
});
