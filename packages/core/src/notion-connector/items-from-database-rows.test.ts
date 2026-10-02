import { describe, expect, it } from "vitest";
import { itemsFromDatabaseRows } from "./items-from-database-rows.js";

const EDITED_AT = "2026-10-01T00:00:00.000Z";

describe("itemsFromDatabaseRows", () => {
  it("reads the title as text and a Tags multi-select as tags", () => {
    const items = itemsFromDatabaseRows([
      {
        id: "r1",
        last_edited_time: EDITED_AT,
        properties: {
          Name: { type: "title", title: [{ plain_text: "Ship the pricing page" }] },
          Tags: { type: "multi_select", multi_select: [{ name: "CRM" }, { name: "urgent" }] },
        },
      },
    ]);

    expect(items).toEqual([
      { id: "r1", text: "Ship the pricing page", tags: ["CRM", "urgent"], lastEditedTime: EDITED_AT },
    ]);
  });

  it("falls back to a single Tag select", () => {
    const items = itemsFromDatabaseRows([
      {
        id: "r2",
        last_edited_time: EDITED_AT,
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
      { id: "blank", last_edited_time: EDITED_AT, properties: { Name: { type: "title", title: [] } } },
      {
        id: "plain",
        last_edited_time: EDITED_AT,
        properties: { Name: { type: "title", title: [{ plain_text: "Plain" }] } },
      },
    ]);

    expect(items).toEqual([{ id: "plain", text: "Plain", tags: [], lastEditedTime: EDITED_AT }]);
  });
});
