import { describe, expect, it } from "vitest";
import { buildCategoryPickerOptions } from "./build-category-picker-options";

describe("buildCategoryPickerOptions", () => {
  it("offers the subject root as the first option even with no categories yet", () => {
    expect(buildCategoryPickerOptions([], "sub_ai", "AI")).toEqual([
      { nodeId: null, label: "AI", depth: 0 },
    ]);
  });

  it("lists every category under the subject root, one level deep", () => {
    const categories = [
      { id: "cat_rag", subjectId: "sub_ai", parentId: null, name: "RAG" },
    ];

    expect(buildCategoryPickerOptions(categories, "sub_ai", "AI")).toEqual([
      { nodeId: null, label: "AI", depth: 0 },
      { nodeId: "cat_rag", label: "AI > RAG", depth: 1 },
    ]);
  });

  it("labels a nested category with its full breadcrumb path and increasing depth", () => {
    const categories = [
      { id: "cat_webdev", subjectId: "sub_webdev", parentId: null, name: "Web Theory" },
      {
        id: "cat_storage",
        subjectId: "sub_webdev",
        parentId: "cat_webdev",
        name: "Storage",
      },
    ];

    expect(
      buildCategoryPickerOptions(categories, "sub_webdev", "Programming / Web Development"),
    ).toEqual([
      { nodeId: null, label: "Programming / Web Development", depth: 0 },
      { nodeId: "cat_webdev", label: "Programming / Web Development > Web Theory", depth: 1 },
      {
        nodeId: "cat_storage",
        label: "Programming / Web Development > Web Theory > Storage",
        depth: 2,
      },
    ]);
  });

  it("scopes the picker to the one subject's own categories, never another subject's tree", () => {
    const categories = [
      { id: "cat_rag", subjectId: "sub_ai", parentId: null, name: "RAG" },
      { id: "cat_web_theory", subjectId: "sub_webdev", parentId: null, name: "Web Theory" },
    ];

    const options = buildCategoryPickerOptions(categories, "sub_ai", "AI");

    expect(options.map((option) => option.nodeId)).toEqual([null, "cat_rag"]);
  });
});
