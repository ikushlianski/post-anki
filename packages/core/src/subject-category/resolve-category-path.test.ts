import { describe, expect, it } from "vitest";
import { resolveCategoryPath } from "./resolve-category-path";

describe("resolveCategoryPath", () => {
  it("returns an empty breadcrumb when a curriculum has no category (directly under the subject)", () => {
    expect(resolveCategoryPath(null, [])).toEqual([]);
  });

  it("returns a single-entry breadcrumb for a category that sits directly under the subject", () => {
    const categories = [{ id: "cat_rag", subjectId: "sub_ai", parentId: null, name: "RAG" }];

    expect(resolveCategoryPath("cat_rag", categories)).toEqual([
      { id: "cat_rag", name: "RAG" },
    ]);
  });

  it("orders a multi-level breadcrumb from the subject root down to the target category", () => {
    const categories = [
      { id: "cat_webdev", subjectId: "sub_webdev", parentId: null, name: "Web Theory" },
      {
        id: "cat_storage",
        subjectId: "sub_webdev",
        parentId: "cat_webdev",
        name: "Storage",
      },
    ];

    expect(resolveCategoryPath("cat_storage", categories)).toEqual([
      { id: "cat_webdev", name: "Web Theory" },
      { id: "cat_storage", name: "Storage" },
    ]);
  });

  it("returns an empty breadcrumb for a category id that names no known category", () => {
    expect(resolveCategoryPath("cat_ghost", [])).toEqual([]);
  });
});
