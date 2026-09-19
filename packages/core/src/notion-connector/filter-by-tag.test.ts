import { describe, expect, it } from "vitest";
import { filterByTag } from "./filter-by-tag.js";

describe("filterByTag", () => {
  it("keeps only items carrying the connector's tag, ignoring case", () => {
    const items = [
      { id: "a", text: "one", tags: ["spa"] },
      { id: "b", text: "two", tags: ["CRM"] },
      { id: "c", text: "three", tags: [] },
    ];

    expect(filterByTag(items, "SPA").map((item) => item.id)).toEqual(["a"]);
  });
});
