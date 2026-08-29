import { describe, expect, it } from "vitest";
import { validateCategoryBelongsToSubject } from "./validate-category-belongs-to-subject";

describe("validateCategoryBelongsToSubject", () => {
  it("allows leaving a curriculum or category uncategorized (null is always valid)", () => {
    expect(
      validateCategoryBelongsToSubject(null, "sub_ai", [
        { id: "cat_rag", subjectId: "sub_ai" },
      ]),
    ).toBe(true);
  });

  it("allows a category that belongs to the target subject", () => {
    expect(
      validateCategoryBelongsToSubject("cat_rag", "sub_ai", [
        { id: "cat_rag", subjectId: "sub_ai" },
        { id: "cat_web_theory", subjectId: "sub_webdev" },
      ]),
    ).toBe(true);
  });

  it("rejects a category that belongs to a different subject (cross-subject move)", () => {
    expect(
      validateCategoryBelongsToSubject("cat_web_theory", "sub_ai", [
        { id: "cat_rag", subjectId: "sub_ai" },
        { id: "cat_web_theory", subjectId: "sub_webdev" },
      ]),
    ).toBe(false);
  });

  it("rejects a category id that names no known category (nonexistent subject)", () => {
    expect(validateCategoryBelongsToSubject("cat_ghost", "sub_ai", [])).toBe(false);
  });
});
