import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

interface TokenRow {
  id: string;
  tokenHash: string;
  revokedAt: Date | null;
}

const state = vi.hoisted(() => ({
  subjectRows: [] as unknown[],
  tokenRows: [] as TokenRow[],
  touchedIds: [] as string[],
}));

const dbState = vi.hoisted(() => ({ subjectsShouldThrow: false }));

vi.mock("../db/client.js", () => {
  let mode: "select" | "update" = "select";

  const chain = {
    select: () => {
      mode = "select";

      return chain;
    },
    from: () => chain,
    orderBy: () => {
      if (dbState.subjectsShouldThrow) {
        throw new Error("connection refused: raw driver detail nobody should see");
      }

      return state.subjectRows;
    },
    where: (..._args: unknown[]) => {
      if (mode === "update") {
        return Promise.resolve();
      }

      return chain;
    },
    limit: () => state.tokenRows,
    update: () => {
      mode = "update";

      return chain;
    },
    set: () => chain,
  };

  return { getDb: () => chain };
});

vi.mock("../api-token/api-token.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../api-token/api-token.repo.js")>(
    "../api-token/api-token.repo.js",
  );

  return {
    ...actual,
    touchLastUsed: vi.fn(async (id: string) => {
      state.touchedIds.push(id);
    }),
  };
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
  state.tokenRows = [];
  state.touchedIds = [];
  dbState.subjectsShouldThrow = false;
  vi.clearAllMocks();
});

function mcpHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

function initializeBody() {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.1" },
    },
  });
}

describe("POST /mcp connection and auth", () => {
  it("completes initialize and tools/list with a valid shared token and sees list_decks", async () => {
    const client = new Client({ name: "test-client", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${SHARED_SECRET}` } },
    });

    await client.connect(transport);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain("list_decks");

    const listDecksTool = tools.find((tool) => tool.name === "list_decks");

    expect(listDecksTool?.annotations?.readOnlyHint).toBe(true);

    await client.close();
  });

  it("rejects a POST with no bearer token with 401 before any MCP handling", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(),
      body: initializeBody(),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a POST with a wrong bearer token with 401", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders("not-the-right-token"),
      body: initializeBody(),
    });

    expect(res.status).toBe(401);
  });

  it("lets an active api_tokens-issued token reach /mcp, and touches its last-used timestamp", async () => {
    state.tokenRows = [{ id: "tok_active", tokenHash: "irrelevant", revokedAt: null }];

    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders("some-issued-token"),
      body: initializeBody(),
    });

    expect(res.status).toBe(200);
    expect(state.touchedIds).toEqual(["tok_active"]);
  });

  it("can no longer reach /mcp once that token is revoked", async () => {
    const past = new Date(Date.now() - 60_000);

    state.tokenRows = [{ id: "tok_revoked", tokenHash: "irrelevant", revokedAt: past }];

    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders("some-issued-token"),
      body: initializeBody(),
    });

    expect(res.status).toBe(401);
    expect(state.touchedIds).toEqual([]);
  });

  it("returns 405 for GET /mcp", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "GET",
      headers: { authorization: `Bearer ${SHARED_SECRET}` },
    });

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("returns 405 for DELETE /mcp", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${SHARED_SECRET}` },
    });

    expect(res.status).toBe(405);
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

    const client = new Client({ name: "test-client", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${SHARED_SECRET}` } },
    });

    await client.connect(transport);

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
    const client = new Client({ name: "test-client", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${SHARED_SECRET}` } },
    });

    await client.connect(transport);

    const result = await client.callTool({ name: "list_decks", arguments: { limit: -1 } });

    expect(result.isError).toBe(true);

    await client.close();
  });

  it("succeeds for two consecutive requests with no session id, since the server is stateless", async () => {
    const first = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(SHARED_SECRET),
      body: initializeBody(),
    });
    const second = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(SHARED_SECRET),
      body: initializeBody(),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.get("mcp-session-id")).toBeNull();
    expect(second.headers.get("mcp-session-id")).toBeNull();
  });
});

describe("POST /mcp tool error handling", () => {
  it("returns a generic isError result, not the raw exception, when a tool's DB read fails", async () => {
    dbState.subjectsShouldThrow = true;

    const client = new Client({ name: "test-client", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${SHARED_SECRET}` } },
    });

    await client.connect(transport);

    const result = await client.callTool({ name: "list_decks", arguments: {} });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).not.toContain("raw driver detail");
    expect(text).toContain("list_decks");

    await client.close();
  });
});
