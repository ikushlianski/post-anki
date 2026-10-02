import { describe, expect, it } from "vitest";
import { filterByTag } from "./filter-by-tag.js";

describe("filterByTag", () => {
  it("keeps only items carrying the connector's tag, ignoring case", () => {
    const items = [
      { id: "a", text: "one", tags: ["spa"], lastEditedTime: "2026-10-01T00:00:00.000Z" },
      { id: "b", text: "two", tags: ["CRM"], lastEditedTime: "2026-10-01T00:00:00.000Z" },
      { id: "c", text: "three", tags: [], lastEditedTime: "2026-10-01T00:00:00.000Z" },
    ];

    expect(filterByTag(items, "SPA").map((item) => item.id)).toEqual(["a"]);
  });
});
