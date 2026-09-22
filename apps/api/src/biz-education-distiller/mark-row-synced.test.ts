import { describe, expect, it, vi } from "vitest";
import type { Client } from "@notionhq/client";
import { markRowSynced } from "./mark-row-synced.js";

function stubClient(update: ReturnType<typeof vi.fn>): Client {
  return { pages: { update } } as unknown as Client;
}

describe("markRowSynced", () => {
  it("writes today's date into the PostAnki Synced property", async () => {
    const update = vi.fn().mockResolvedValue({});

    await markRowSynced("page-1", stubClient(update), () => "2026-09-22");

    expect(update).toHaveBeenCalledWith({
      page_id: "page-1",
      properties: { "PostAnki Synced": { date: { start: "2026-09-22" } } },
    });
  });
});
