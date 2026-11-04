import { APIErrorCode, APIResponseError, type Client } from "@notionhq/client";
import { describe, expect, it, vi } from "vitest";
import { NotionNotConnectedError } from "./notion-page.gateway.js";

vi.mock("../facts/facts-embedding.orchestrator.js", () => ({ embedFacts: vi.fn() }));

process.env.DATABASE_URL ??= "postgres://postanki:postanki@localhost:5578/postanki_dev";
process.env.OPENROUTER_API_KEY ??= "test-dummy-key";

const { createNotionApiGateway } = await import("./notion-api.gateway.js");

function block(id: string, text: string, hasChildren = false) {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: hasChildren,
    last_edited_time: "2026-10-30T00:00:00.000Z",
    paragraph: { rich_text: [{ type: "text", plain_text: text, text: { content: text }, annotations: {} }] },
  };
}

function stubClient(overrides: Record<string, unknown> = {}) {
  const client = {
    blocks: {
      children: { list: vi.fn() },
      retrieve: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    users: { me: vi.fn() },
    ...overrides,
  };

  return client;
}

function gatewayFor(client: ReturnType<typeof stubClient>, token: string | null = "tok") {
  const factory = vi.fn(() => client as unknown as Client);

  return { gateway: createNotionApiGateway(async () => token, factory), factory };
}

describe("createNotionApiGateway", () => {
  it("should page through the page and stop at the block cap", async () => {
    const client = stubClient();

    client.blocks.children.list
      .mockResolvedValueOnce({ results: [block("b1", "one"), block("b2", "two")], has_more: true, next_cursor: "c1" })
      .mockResolvedValueOnce({ results: [block("b3", "three"), block("b4", "four")], has_more: true, next_cursor: "c2" })
      .mockResolvedValueOnce({ results: [block("b5", "five")], has_more: false, next_cursor: null });

    const { items, truncated } = await gatewayFor(client).gateway.readItems("page", 3);

    expect(items.map((item) => item.id)).toEqual(["b1", "b2", "b3"]);
    expect(truncated).toBe(true);
    expect(client.blocks.children.list).toHaveBeenCalledTimes(2);
  });

  it("should read every block when the page is under the cap", async () => {
    const client = stubClient();

    client.blocks.children.list
      .mockResolvedValueOnce({ results: [block("b1", "one")], has_more: true, next_cursor: "c1" })
      .mockResolvedValueOnce({ results: [block("b2", "two")], has_more: false, next_cursor: null });

    const { items, truncated } = await gatewayFor(client).gateway.readItems("page", 500);

    expect(items).toEqual([
      { id: "b1", text: "one" },
      { id: "b2", text: "two" },
    ]);
    expect(truncated).toBe(false);
  });

  it("should skip blocks that have nested children so section labels are not imported as phrases", async () => {
    const client = stubClient();

    client.blocks.children.list.mockResolvedValueOnce({
      results: [block("label", "ads", true), block("b1", "keep chipping away")],
      has_more: false,
      next_cursor: null,
    });

    const { items } = await gatewayFor(client).gateway.readItems("page", 500);

    expect(items).toEqual([{ id: "b1", text: "keep chipping away" }]);
  });

  it("should never delete a block that has nested children", async () => {
    const client = stubClient();

    client.blocks.retrieve.mockImplementation(async ({ block_id }: { block_id: string }) =>
      block(block_id, "x", block_id === "nested"),
    );

    const result = await gatewayFor(client).gateway.removeItems("page", ["plain", "nested"]);

    expect(result).toEqual({ removed: ["plain"], failed: ["nested"] });
    expect(client.blocks.delete).toHaveBeenCalledTimes(1);
    expect(client.blocks.delete).toHaveBeenCalledWith({ block_id: "plain" });
  });

  it("should report a block as not removed when Notion refuses the delete", async () => {
    const client = stubClient();

    client.blocks.retrieve.mockResolvedValue(block("b1", "x"));
    client.blocks.delete.mockRejectedValue(new Error("restricted"));

    expect(await gatewayFor(client).gateway.removeItems("page", ["b1"])).toEqual({ removed: [], failed: ["b1"] });
  });

  it("should use a client built from the resolved token on every call", async () => {
    const client = stubClient();

    client.blocks.children.list.mockResolvedValue({ results: [], has_more: false, next_cursor: null });

    const { gateway, factory } = gatewayFor(client, "tok_1");

    await gateway.readItems("page", 10);
    await gateway.readItems("page", 10);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenCalledWith("tok_1");
  });

  it("should throw not-connected when no token resolves", async () => {
    const { gateway } = gatewayFor(stubClient(), null);

    await expect(gateway.readItems("page", 10)).rejects.toBeInstanceOf(NotionNotConnectedError);
  });

  it("should tell the user Notion is unreachable when the check fails for a non-auth reason", async () => {
    const client = stubClient();

    client.users.me.mockRejectedValue(new Error("fetch failed tok"));

    expect(await gatewayFor(client).gateway.checkConnection()).toEqual({
      ok: false,
      workspaceName: null,
      reason: "unreachable",
    });
  });

  it("should tell the user the token is bad when Notion answers unauthorized", async () => {
    const client = stubClient();

    client.users.me.mockRejectedValue(
      new APIResponseError({
        code: APIErrorCode.Unauthorized,
        status: 401,
        message: "API token is invalid.",
        headers: {},
        rawBodyText: "",
        additional_data: undefined,
        request_id: undefined,
      }),
    );

    expect(await gatewayFor(client).gateway.checkConnection()).toEqual({
      ok: false,
      workspaceName: null,
      reason: "invalid_token",
    });
  });

  it("should say no token is connected when none resolves", async () => {
    const { gateway } = gatewayFor(stubClient(), null);

    expect(await gateway.checkConnection()).toEqual({ ok: false, workspaceName: null, reason: "not_connected" });
  });

  it("should return the workspace name for a bot token", async () => {
    const client = stubClient();

    client.users.me.mockResolvedValue({ type: "bot", bot: { workspace_name: "Acme" } });

    expect(await gatewayFor(client).gateway.checkConnection()).toEqual({ ok: true, workspaceName: "Acme", reason: null });
  });
});
