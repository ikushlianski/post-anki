import { describe, expect, it } from "vitest";
import { wouldCreateCategoryCycle } from "./would-create-cycle";
import { validateCategoryBelongsToSubject } from "./validate-category-belongs-to-subject";

const categories = [
  { id: "cat_webdev", subjectId: "sub_webdev", parentId: null, name: "Web Theory" },
  { id: "cat_storage", subjectId: "sub_webdev", parentId: "cat_webdev", name: "Storage" },
  { id: "cat_ai", subjectId: "sub_ai", parentId: null, name: "AI" },
];

describe("wouldCreateCategoryCycle", () => {
  it("allows a valid move where the new parent is neither the category nor its descendant", () => {
    expect(wouldCreateCategoryCycle("cat_storage", "cat_ai", categories)).toBe(false);
  });

  it("rejects a category being re-parented under itself", () => {
    expect(wouldCreateCategoryCycle("cat_webdev", "cat_webdev", categories)).toBe(true);
  });

  it("rejects a category being re-parented under one of its own descendants", () => {
    expect(wouldCreateCategoryCycle("cat_webdev", "cat_storage", categories)).toBe(true);
  });

  it("leaves cross-subject moves to validateCategoryBelongsToSubject rather than flagging a cycle", () => {
    expect(wouldCreateCategoryCycle("cat_storage", "cat_ai", categories)).toBe(false);
    expect(validateCategoryBelongsToSubject("cat_ai", "sub_webdev", categories)).toBe(false);
  });
});
