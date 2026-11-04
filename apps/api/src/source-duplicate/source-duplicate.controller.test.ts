import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveSuggestion = vi.hoisted(() => vi.fn());
const listSuggestions = vi.hoisted(() => vi.fn());

vi.mock("./source-duplicate.repo.js", () => ({
  resolveSourceDuplicateSuggestion: resolveSuggestion,
  listSourceDuplicateSuggestions: listSuggestions,
}));
vi.mock("./source-duplicate.orchestrator.js", () => ({ triggerSourceDuplicateScan: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn() } }));

import {
  handleListSourceDuplicateSuggestions,
  handleResolveSourceDuplicateSuggestion,
} from "./source-duplicate.controller.js";

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
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

beforeEach(() => {
  resolveSuggestion.mockReset();
  listSuggestions.mockReset();
});

describe("handleListSourceDuplicateSuggestions", () => {
  it("should answer 400 for an unknown status filter", async () => {
    const res = fakeRes();

    await handleListSourceDuplicateSuggestions(res, "bogus");

    expect(sent(res).status).toBe(400);
  });

  it("should list suggestions with the status filter", async () => {
    listSuggestions.mockResolvedValue([]);
    const res = fakeRes();

    await handleListSourceDuplicateSuggestions(res, "pending");

    expect(listSuggestions).toHaveBeenCalledWith("pending");
    expect(sent(res).status).toBe(200);
  });
});

describe("handleResolveSourceDuplicateSuggestion", () => {
  it("should answer 400 for a status other than acknowledged or dismissed", async () => {
    const res = fakeRes();

    await handleResolveSourceDuplicateSuggestion(fakeReq({ status: "pending" }), res, "d1");

    expect(sent(res).status).toBe(400);
    expect(resolveSuggestion).not.toHaveBeenCalled();
  });

  it("should answer 404 for an unknown suggestion", async () => {
    resolveSuggestion.mockResolvedValue({ error: "not_found" });
    const res = fakeRes();

    await handleResolveSourceDuplicateSuggestion(fakeReq({ status: "dismissed" }), res, "nope");

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
  });

  it("should answer 409 when the suggestion was already resolved", async () => {
    resolveSuggestion.mockResolvedValue({ error: "already_resolved" });
    const res = fakeRes();

    await handleResolveSourceDuplicateSuggestion(fakeReq({ status: "dismissed" }), res, "d1");

    expect(sent(res)).toEqual({ status: 409, body: { error: "already_resolved" } });
  });

  it("should answer 200 with the resolved suggestion", async () => {
    resolveSuggestion.mockResolvedValue({ id: "d1", status: "acknowledged" });
    const res = fakeRes();

    await handleResolveSourceDuplicateSuggestion(fakeReq({ status: "acknowledged" }), res, "d1");

    expect(sent(res)).toEqual({ status: 200, body: { id: "d1", status: "acknowledged" } });
  });
});
