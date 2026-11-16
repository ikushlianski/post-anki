import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  decideRewordedDraft: vi.fn(),
  listPendingRewordedDrafts: vi.fn(),
}));

vi.mock("../db/client.js", () => ({ getDb: () => ({}) }));
vi.mock("./card-rewording.repo.js", () => repo);

const { handleDecideRewordedDraft, handleListRewordedDrafts } = await import("./card-rewording.controller.js");

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

const fakeReq = (body: unknown) => Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;

describe("reworded drafts controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should list the pending drafts with their original fronts", async () => {
    repo.listPendingRewordedDrafts.mockResolvedValue([{ id: "kbrd_1", originalPrompt: "orig", prompt: "new" }]);

    const res = fakeRes();

    await handleListRewordedDrafts(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ drafts: [{ id: "kbrd_1", originalPrompt: "orig", prompt: "new" }] });
  });

  it("should report the new version id when a draft is approved", async () => {
    repo.decideRewordedDraft.mockResolvedValue({ status: "ok", variantId: "kbqv_1" });

    const res = fakeRes();

    await handleDecideRewordedDraft(fakeReq({ decision: "approved" }), res, "kbrd_1");

    expect(repo.decideRewordedDraft).toHaveBeenCalledWith(expect.anything(), "kbrd_1", "approved");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "kbrd_1", decision: "approved", variantId: "kbqv_1" });
  });

  it("should answer 404 for an unknown draft", async () => {
    repo.decideRewordedDraft.mockResolvedValue({ status: "not_found" });

    const res = fakeRes();

    await handleDecideRewordedDraft(fakeReq({ decision: "rejected" }), res, "kbrd_x");

    expect(res.status).toBe(404);
  });

  it("should answer 409 when the draft was already decided or its card is no longer approved", async () => {
    repo.decideRewordedDraft.mockResolvedValue({ status: "conflict" });

    const res = fakeRes();

    await handleDecideRewordedDraft(fakeReq({ decision: "approved" }), res, "kbrd_1");

    expect(res.status).toBe(409);
  });

  it("should answer 400 and decide nothing for an unknown decision value", async () => {
    const res = fakeRes();

    await handleDecideRewordedDraft(fakeReq({ decision: "maybe" }), res, "kbrd_1");

    expect(res.status).toBe(400);
    expect(repo.decideRewordedDraft).not.toHaveBeenCalled();
  });
});
