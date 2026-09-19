import { describe, expect, it } from "vitest";
import { itemsFromDatabaseRows } from "./items-from-database-rows.js";

describe("itemsFromDatabaseRows", () => {
  it("reads the title as text and a Tags multi-select as tags", () => {
    const items = itemsFromDatabaseRows([
      {
        id: "r1",
        properties: {
          Name: { type: "title", title: [{ plain_text: "Ship the pricing page" }] },
          Tags: { type: "multi_select", multi_select: [{ name: "CRM" }, { name: "urgent" }] },
        },
      },
    ]);

    expect(items).toEqual([{ id: "r1", text: "Ship the pricing page", tags: ["CRM", "urgent"] }]);
  });

  it("falls back to a single Tag select", () => {
    const items = itemsFromDatabaseRows([
      {
        id: "r2",
        properties: {
          Title: { type: "title", title: [{ plain_text: "A fact" }] },
          Tag: { type: "select", select: { name: "SPA" } },
        },
      },
    ]);

    expect(items[0]?.tags).toEqual(["SPA"]);
  });

  it("yields no tags for an untagged row and skips rows with an empty title", () => {
    const items = itemsFromDatabaseRows([
      { id: "blank", properties: { Name: { type: "title", title: [] } } },
      { id: "plain", properties: { Name: { type: "title", title: [{ plain_text: "Plain" }] } } },
    ]);

    expect(items).toEqual([{ id: "plain", text: "Plain", tags: [] }]);
  });
});
