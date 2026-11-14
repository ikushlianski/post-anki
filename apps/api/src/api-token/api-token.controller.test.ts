import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken } from "./api-token.hash.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

const repo = vi.hoisted(() => ({
  insertApiToken: vi.fn(),
  getApiTokenSummary: vi.fn(),
  listApiTokens: vi.fn(),
  revokeApiTokenById: vi.fn(),
}));

vi.mock("./api-token.repo.js", () => ({ insertApiToken: repo.insertApiToken }));
vi.mock("./api-token.owner.repo.js", () => ({
  getApiTokenSummary: repo.getApiTokenSummary,
  listApiTokens: repo.listApiTokens,
  revokeApiTokenById: repo.revokeApiTokenById,
}));

const { setRequestAuthContext, fullAccessContext } = await import("../auth/request-auth-context.js");
const { handleCreateApiToken, handleListApiTokens, handleRevokeApiToken } = await import("./api-token.controller.js");

const summary = {
  id: "apitoken_1",
  name: "claude desktop",
  scopes: ["knowledge:write"],
  createdAt: "2026-11-14T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
};

function makeReq(kind: "session" | "device", body?: unknown): http.IncomingMessage {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;

  req.headers = {};

  if (kind === "device") {
    setRequestAuthContext(req, { kind: "device_token", scopes: ["knowledge:write"] });
  } else {
    setRequestAuthContext(req, fullAccessContext("session_token"));
  }

  return req;
}

function makeRes() {
  const state = { status: 0, body: undefined as unknown };
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(status: number) {
      state.status = status;

      return this;
    },
    end(payload?: string) {
      state.body = payload ? JSON.parse(payload) : undefined;
    },
  } as unknown as http.ServerResponse;

  return { res, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.insertApiToken.mockResolvedValue({ id: summary.id, userId: null });
  repo.getApiTokenSummary.mockResolvedValue(summary);
  repo.listApiTokens.mockResolvedValue([summary]);
});

describe("POST /api-tokens", () => {
  it("should return the raw pat_ key once and store only its hash", async () => {
    const { res, state } = makeRes();

    await handleCreateApiToken(makeReq("session", { name: "claude desktop" }), res);

    const body = state.body as { token: string };
    const stored = repo.insertApiToken.mock.calls[0]![0] as { tokenHash: string; scopes: string[]; label: string };

    expect(state.status).toBe(201);
    expect(body.token).toMatch(/^pat_[0-9a-f]{64}$/);
    expect(stored.tokenHash).toBe(hashApiToken(body.token));
    expect(JSON.stringify(stored)).not.toContain(body.token);
    expect(stored.scopes).toEqual(["knowledge:write"]);
  });

  it("should store the scopes the owner picked", async () => {
    const { res } = makeRes();

    await handleCreateApiToken(makeReq("session", { name: "k", scopes: ["knowledge:write", "cards:write"] }), res);

    expect(repo.insertApiToken.mock.calls[0]![0]).toMatchObject({ scopes: ["knowledge:write", "cards:write"] });
  });

  it("should refuse an unknown scope and mint nothing", async () => {
    const { res, state } = makeRes();

    await handleCreateApiToken(makeReq("session", { name: "k", scopes: ["admin"] }), res);

    expect(state.status).toBe(400);
    expect(repo.insertApiToken).not.toHaveBeenCalled();
  });

  it("should not let an API key mint another key", async () => {
    const { res, state } = makeRes();

    await handleCreateApiToken(makeReq("device", { name: "escalate" }), res);

    expect(state.status).toBe(403);
    expect(repo.insertApiToken).not.toHaveBeenCalled();
  });
});

describe("GET /api-tokens", () => {
  it("should list keys without any secret material", async () => {
    const { res, state } = makeRes();

    await handleListApiTokens(makeReq("session"), res);

    expect(state.status).toBe(200);
    expect(JSON.stringify(state.body)).not.toMatch(/pat_|hash/i);
  });

  it("should not let an API key list keys", async () => {
    const { res, state } = makeRes();

    await handleListApiTokens(makeReq("device"), res);

    expect(state.status).toBe(403);
  });
});

describe("DELETE /api-tokens/:id", () => {
  it("should revoke an active key", async () => {
    repo.revokeApiTokenById.mockResolvedValue(true);
    const { res, state } = makeRes();

    await handleRevokeApiToken(makeReq("session"), res, summary.id);

    expect(state.status).toBe(200);
  });

  it("should answer 404 for an unknown key", async () => {
    repo.revokeApiTokenById.mockResolvedValue(false);
    repo.getApiTokenSummary.mockResolvedValue(null);
    const { res, state } = makeRes();

    await handleRevokeApiToken(makeReq("session"), res, "nope");

    expect(state.status).toBe(404);
  });

  it("should answer 409 for an already revoked key", async () => {
    repo.revokeApiTokenById.mockResolvedValue(false);
    const { res, state } = makeRes();

    await handleRevokeApiToken(makeReq("session"), res, summary.id);

    expect(state.status).toBe(409);
  });

  it("should not let an API key revoke keys", async () => {
    const { res, state } = makeRes();

    await handleRevokeApiToken(makeReq("device"), res, summary.id);

    expect(state.status).toBe(403);
    expect(repo.revokeApiTokenById).not.toHaveBeenCalled();
  });
});
