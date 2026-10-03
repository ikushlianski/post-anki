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
  tokenRows: [] as TokenRow[],
  touchedIds: [] as string[],
}));

vi.mock("../db/client.js", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    orderBy: () => [],
    where: () => chain,
    limit: () => state.tokenRows,
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
  state.tokenRows = [];
  state.touchedIds = [];
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

describe("POST /mcp auth", () => {
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

  it("accepts the shared secret via the timing-safe comparison", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(SHARED_SECRET),
      body: initializeBody(),
    });

    expect(res.status).toBe(200);
  });

  it("rejects a wrong secret of a different length without throwing", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders("x"),
      body: initializeBody(),
    });

    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret that is much longer than the real one without throwing", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(`${SHARED_SECRET}-and-then-some-extra-padding-here`),
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
