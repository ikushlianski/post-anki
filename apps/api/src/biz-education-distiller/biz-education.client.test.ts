import { describe, expect, it, vi } from "vitest";
import type { Client } from "@notionhq/client";
import { listUnsyncedTaggedRows } from "./biz-education.client.js";

function row(
  id: string,
  title: string,
  tags: string[],
  createdTime: string,
  synced: string | null = null,
) {
  return {
    object: "page",
    url: `https://notion.so/${id}`,
    id,
    created_time: createdTime,
    properties: {
      Note: { type: "title", title: [{ plain_text: title }] },
      Tags: { type: "multi_select", multi_select: tags.map((name) => ({ name })) },
      "PostAnki Synced": synced
        ? { type: "date", date: { start: synced } }
        : { type: "date", date: null },
    },
  };
}

function stubClient(query: ReturnType<typeof vi.fn>): Client {
  return { dataSources: { query } } as unknown as Client;
}

describe("listUnsyncedTaggedRows", () => {
  it("keeps only rows tagged PA, oldest first", async () => {
    const query = vi.fn().mockResolvedValue({
      results: [
        row("r-new", "Newer idea", ["PA"], "2026-09-20T00:00:00.000Z"),
        row("r-old", "Older idea", ["PA"], "2026-09-10T00:00:00.000Z"),
        row("r-other-tag", "Not for us", ["CRM"], "2026-09-01T00:00:00.000Z"),
      ],
      has_more: false,
      next_cursor: null,
    });

    const rows = await listUnsyncedTaggedRows(stubClient(query));

    expect(rows.map((r) => r.id)).toEqual(["r-old", "r-new"]);
  });

  it("asks Notion to filter out already-synced and non-PA rows instead of paging them all", async () => {
    const query = vi.fn().mockResolvedValue({ results: [], has_more: false, next_cursor: null });

    await listUnsyncedTaggedRows(stubClient(query));

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          and: [
            { property: "PostAnki Synced", date: { is_empty: true } },
            { property: "Tags", multi_select: { contains: "PA" } },
          ],
        },
      }),
    );
  });

  it("still returns a row whose title contains a question mark", async () => {
    const query = vi.fn().mockResolvedValue({
      results: [row("r-q", "What is the fanout method?", ["PA"], "2026-09-01T00:00:00.000Z")],
      has_more: false,
      next_cursor: null,
    });

    const rows = await listUnsyncedTaggedRows(stubClient(query));

    expect(rows).toEqual([
      { id: "r-q", text: "What is the fanout method?", tags: ["PA"], createdTime: "2026-09-01T00:00:00.000Z" },
    ]);
  });

  it("caps at 20 rows even when more are unsynced and tagged", async () => {
    const results = Array.from({ length: 25 }, (_, i) =>
      row(`r-${i}`, `Idea ${i}`, ["PA"], `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const query = vi.fn().mockResolvedValue({ results, has_more: false, next_cursor: null });

    const rows = await listUnsyncedTaggedRows(stubClient(query));

    expect(rows).toHaveLength(20);
    expect(rows[0]!.id).toBe("r-0");
  });

  it("queries the real Biz Education data source", async () => {
    const query = vi.fn().mockResolvedValue({ results: [], has_more: false, next_cursor: null });

    await listUnsyncedTaggedRows(stubClient(query));

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ data_source_id: "3cddec4d-fc6e-805c-93ea-000bc235a121" }),
    );
  });
});
