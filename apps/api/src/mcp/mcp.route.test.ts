import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  subjectRows: [] as unknown[],
}));

const dbState = vi.hoisted(() => ({ subjectsShouldThrow: false }));

vi.mock("../db/client.js", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    orderBy: () => {
      if (dbState.subjectsShouldThrow) {
        throw new Error("connection refused: raw driver detail nobody should see");
      }

      return state.subjectRows;
    },
    where: () => chain,
  };

  return { getDb: () => chain };
});

vi.mock("../api-token/api-token.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../api-token/api-token.repo.js")>(
    "../api-token/api-token.repo.js",
  );

  return { ...actual, touchLastUsed: vi.fn(async () => {}) };
});

const { createApiServer } = await import("../api-server.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import(
  "@modelcontextprotocol/sdk/client/streamableHttp.js"
);

const SHARED_SECRET = process.env.API_SHARED_SECRET!;

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  state.subjectRows = [];
  dbState.subjectsShouldThrow = false;
  vi.clearAllMocks();
});

async function connectedClient(): Promise<InstanceType<typeof Client>> {
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${SHARED_SECRET}` } },
  });

  await client.connect(transport);

  return client;
}

describe("POST /mcp tools", () => {
  it("completes initialize and tools/list with a valid shared token and sees every read-only tool", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();

    const expectedToolNames = [
      "list_decks",
      "list_courses",
      "get_course_structure",
      "get_topic_cards",
      "list_course_cards",
      "get_deck_items",
      "search_knowledge_items",
    ];

    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(expectedToolNames));

    for (const name of expectedToolNames) {
      const tool = tools.find((t) => t.name === name);

      expect(tool?.annotations?.readOnlyHint).toBe(true);
    }

    await client.close();
  });

  it("calls list_decks through the MCP layer and gets back only language-practice subjects", async () => {
    state.subjectRows = [
      {
        id: "deck_1",
        name: "Spanish",
        description: null,
        requireSources: false,
        kind: "language-practice",
        modelTier: null,
      },
      {
        id: "course_1",
        name: "Architecture",
        description: null,
        requireSources: false,
        kind: "architecture-mentor",
        modelTier: null,
      },
    ];

    const client = await connectedClient();
    const result = await client.callTool({ name: "list_decks", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [{ id: "deck_1", name: "Spanish", description: null }],
      total: 1,
      limit: 50,
      offset: 0,
    });

    await client.close();
  });

  it("rejects a negative limit at the input schema, before any database read", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "list_decks", arguments: { limit: -1 } });

    expect(result.isError).toBe(true);

    await client.close();
  });
});

describe("POST /mcp tool error handling", () => {
  it("returns a generic isError result, not the raw exception, when a tool's DB read fails", async () => {
    dbState.subjectsShouldThrow = true;

    const client = await connectedClient();
    const result = await client.callTool({ name: "list_decks", arguments: {} });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).not.toContain("raw driver detail");
    expect(text).toContain("list_decks");

    await client.close();
  });
});
