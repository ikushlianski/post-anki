import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-inbox.repo.js", () => ({
  countInboxKnowledgeBits: vi.fn(),
  discardKnowledgeBitFromInbox: vi.fn(),
  listInboxKnowledgeBits: vi.fn(),
  moveKnowledgeBitToInbox: vi.fn(),
  returnKnowledgeBitFromInbox: vi.fn(),
}));

import * as repo from "./knowledge-bit-inbox.repo.js";
import {
  handleDiscardKnowledgeBitFromInbox,
  handleListInboxKnowledgeBits,
  handleMoveKnowledgeBitToInbox,
  handleReturnKnowledgeBitFromInbox,
} from "./knowledge-bit-inbox.controller.js";

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

describe("inbox controllers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should answer a move with ok and the new inbox count", async () => {
    vi.mocked(repo.moveKnowledgeBitToInbox).mockResolvedValue({ ok: true, value: 3 });

    const res = fakeRes();

    await handleMoveKnowledgeBitToInbox(res, "kb_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, inboxCount: 3 });
  });

  it("should answer 404 not_found and 409 blocked on every transition", async () => {
    const handlers = [
      [handleMoveKnowledgeBitToInbox, repo.moveKnowledgeBitToInbox],
      [handleReturnKnowledgeBitFromInbox, repo.returnKnowledgeBitFromInbox],
      [handleDiscardKnowledgeBitFromInbox, repo.discardKnowledgeBitFromInbox],
    ] as const;

    for (const [handler, fn] of handlers) {
      vi.mocked(fn).mockResolvedValueOnce({ ok: false, reason: "not_found" });

      const missing = fakeRes();

      await handler(missing, "kb_x");

      vi.mocked(fn).mockResolvedValueOnce({ ok: false, reason: "blocked" });

      const blocked = fakeRes();

      await handler(blocked, "kb_1");

      expect([missing.status, missing.body]).toEqual([404, { error: "not_found" }]);
      expect([blocked.status, blocked.body]).toEqual([409, { error: "blocked" }]);
    }
  });

  it("should answer return and discard with ok", async () => {
    vi.mocked(repo.returnKnowledgeBitFromInbox).mockResolvedValue({ ok: true, value: undefined });
    vi.mocked(repo.discardKnowledgeBitFromInbox).mockResolvedValue({ ok: true, value: undefined });

    const back = fakeRes();
    const gone = fakeRes();

    await handleReturnKnowledgeBitFromInbox(back, "kb_1");
    await handleDiscardKnowledgeBitFromInbox(gone, "kb_1");

    expect(back.body).toEqual({ ok: true });
    expect(gone.body).toEqual({ ok: true });
  });

  it("should list inbox items with the total count", async () => {
    vi.mocked(repo.listInboxKnowledgeBits).mockResolvedValue([]);
    vi.mocked(repo.countInboxKnowledgeBits).mockResolvedValue(0);

    const res = fakeRes();

    await handleListInboxKnowledgeBits(res);

    expect(res.body).toEqual({ items: [], count: 0, total: 0, hasMore: false });
  });

  it("should flag the list as truncated when more cards exist than were returned", async () => {
    vi.mocked(repo.listInboxKnowledgeBits).mockResolvedValue([]);
    vi.mocked(repo.countInboxKnowledgeBits).mockResolvedValue(250);

    const res = fakeRes();

    await handleListInboxKnowledgeBits(res);

    expect(res.body).toEqual({ items: [], count: 250, total: 250, hasMore: true });
  });
});
