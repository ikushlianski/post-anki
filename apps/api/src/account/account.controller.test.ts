import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCurrentSession = vi.hoisted(() => vi.fn());
const getAccount = vi.hoisted(() => vi.fn());
const updateAccountName = vi.hoisted(() => vi.fn());

vi.mock("../db/client.js", () => ({ getDb: () => ({}) }));
vi.mock("./account.session.js", () => ({ resolveCurrentSession }));
vi.mock("./account.repo.js", () => ({ getAccount, updateAccountName }));

import { handleGetAccount, handleUpdateAccount } from "./account.controller.js";

function fakeReq(body?: unknown): http.IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];

  return Readable.from(chunks) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function sent(res: ReturnType<typeof fakeRes>): { status: number; body: unknown } {
  return {
    status: vi.mocked(res.writeHead).mock.calls[0]![0] as number,
    body: JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string),
  };
}

const session = { userId: "u1", sessionId: "s1", sessionCreatedAt: new Date("2026-03-01T10:00:00Z") };
const account = { id: "u1", name: "Ilya", email: "i@example.com" };

beforeEach(() => {
  resolveCurrentSession.mockReset();
  getAccount.mockReset();
  updateAccountName.mockReset();
});

describe("handleGetAccount", () => {
  it("should answer 401 when nobody is signed in", async () => {
    resolveCurrentSession.mockResolvedValue(null);
    const res = fakeRes();

    await handleGetAccount(fakeReq(), res);

    expect(sent(res)).toEqual({ status: 401, body: { error: "no_user_session" } });
    expect(getAccount).not.toHaveBeenCalled();
  });

  it("should answer 404 when the signed-in user has no account", async () => {
    resolveCurrentSession.mockResolvedValue(session);
    getAccount.mockResolvedValue(null);
    const res = fakeRes();

    await handleGetAccount(fakeReq(), res);

    expect(sent(res)).toEqual({ status: 404, body: { error: "account_not_found" } });
  });

  it("should return the account of the signed-in user", async () => {
    resolveCurrentSession.mockResolvedValue(session);
    getAccount.mockResolvedValue(account);
    const res = fakeRes();

    await handleGetAccount(fakeReq(), res);

    expect(sent(res)).toEqual({ status: 200, body: account });
  });
});

describe("handleUpdateAccount", () => {
  it("should answer 401 when nobody is signed in", async () => {
    resolveCurrentSession.mockResolvedValue(null);
    const res = fakeRes();

    await handleUpdateAccount(fakeReq({ name: "New" }), res);

    expect(sent(res).status).toBe(401);
    expect(updateAccountName).not.toHaveBeenCalled();
  });

  it("should answer 400 and not save a name made only of spaces", async () => {
    resolveCurrentSession.mockResolvedValue(session);
    const res = fakeRes();

    await handleUpdateAccount(fakeReq({ name: "   " }), res);

    expect(sent(res).status).toBe(400);
    expect(updateAccountName).not.toHaveBeenCalled();
  });

  it("should answer 404 when the account to rename does not exist", async () => {
    resolveCurrentSession.mockResolvedValue(session);
    updateAccountName.mockResolvedValue(null);
    const res = fakeRes();

    await handleUpdateAccount(fakeReq({ name: "New" }), res);

    expect(sent(res)).toEqual({ status: 404, body: { error: "account_not_found" } });
  });

  it("should save the trimmed name and return the updated account", async () => {
    resolveCurrentSession.mockResolvedValue(session);
    updateAccountName.mockResolvedValue({ ...account, name: "New" });
    const res = fakeRes();

    await handleUpdateAccount(fakeReq({ name: "  New  " }), res);

    expect(updateAccountName).toHaveBeenCalledWith({}, session, "New");
    expect(sent(res)).toEqual({ status: 200, body: { ...account, name: "New" } });
  });
});
