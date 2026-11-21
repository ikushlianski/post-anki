import { describe, expect, it, vi } from "vitest";
import type { Client } from "@notionhq/client";
import { listPhraseBlocksPage, readSourceItems } from "./notion.client.js";

const EDITED_AT = "2026-10-01T00:00:00.000Z";

function paragraph(id: string, text: string) {
  return {
    object: "block",
    id,
    type: "paragraph",
    last_edited_time: EDITED_AT,
    paragraph: { rich_text: [{ plain_text: text }] },
  };
}

function stubClient(overrides: Record<string, unknown>): Client {
  return overrides as unknown as Client;
}

describe("readSourceItems", () => {
  it("walks every page of a paragraph page's blocks before turning them into items", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        results: [paragraph("b1", "#SPA first")],
        has_more: true,
        next_cursor: "c2",
      })
      .mockResolvedValueOnce({
        results: [paragraph("b2", "second")],
        has_more: false,
        next_cursor: null,
      });
    const client = stubClient({ blocks: { children: { list } } });

    const items = await readSourceItems(
      { kind: "page", id: "2dfdec4dfc6e80bc9803c86fb9e994eb" },
      client,
    );

    expect(items).toEqual([
      { id: "b1", text: "first", tags: ["SPA"], lastEditedTime: EDITED_AT },
      { id: "b2", text: "second", tags: [], lastEditedTime: EDITED_AT },
    ]);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ start_cursor: "c2" }));
  });

  it("reads a database through its first data source and keeps row tags", async () => {
    const query = vi.fn().mockResolvedValue({
      results: [
        {
          object: "page",
          url: "https://notion.so/r1",
          id: "r1",
          last_edited_time: EDITED_AT,
          properties: {
            Name: { type: "title", title: [{ plain_text: "Ship it" }] },
            Tags: { type: "multi_select", multi_select: [{ name: "CRM" }] },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    });
    const client = stubClient({
      databases: { retrieve: vi.fn().mockResolvedValue({ data_sources: [{ id: "ds1" }] }) },
      dataSources: { query },
    });

    const items = await readSourceItems(
      { kind: "database", id: "3cddec4dfc6e80b38224c4ac74164eef" },
      client,
    );

    expect(items).toEqual([{ id: "r1", text: "Ship it", tags: ["CRM"], lastEditedTime: EDITED_AT }]);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ data_source_id: "ds1" }));
  });

  it("rejects a source id that is neither a Notion id nor a Notion URL", async () => {
    await expect(readSourceItems({ kind: "page", id: "not-an-id" }, stubClient({}))).rejects.toThrow(
      /Not a Notion id/,
    );
  });
});

describe("listPhraseBlocksPage", () => {
  it("should return one page of children with the next cursor, passing the cursor on", async () => {
    const list = vi.fn().mockResolvedValue({
      results: [
        { object: "block", id: "n1", type: "bulleted_list_item", has_children: true, bulleted_list_item: { rich_text: [{ plain_text: "ads" }] } },
        { object: "block", id: "p1", type: "child_page", has_children: true, child_page: { title: "English Phrases 2" } },
      ],
      has_more: true,
      next_cursor: "c2",
    });

    const page = await listPhraseBlocksPage("parent", "c1", stubClient({ blocks: { children: { list } } }));

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ block_id: "parent", start_cursor: "c1" }));
    expect(page).toEqual({
      blocks: [
        { id: "n1", type: "bulleted_list_item", text: "ads", hasChildren: true },
        { id: "p1", type: "child_page", text: "", hasChildren: true },
      ],
      nextCursor: "c2",
    });
  });

  it("should report no next cursor on the last page", async () => {
    const list = vi.fn().mockResolvedValue({ results: [], has_more: false, next_cursor: null });

    const page = await listPhraseBlocksPage("parent", null, stubClient({ blocks: { children: { list } } }));

    expect(list.mock.calls[0]?.[0]).not.toHaveProperty("start_cursor");
    expect(page.nextCursor).toBeNull();
  });
});
