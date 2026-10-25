import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const discardKnowledgeSource = vi.fn();

vi.mock("./knowledge-source-discard.repo.js", () => ({
  discardKnowledgeSource: (...args: unknown[]) => discardKnowledgeSource(...args),
}));

const { handleDiscardKnowledgeSource } = await import("./knowledge-source-discard.controller.js");

function fakeRes() {
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

describe("handleDiscardKnowledgeSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should reply 200 with the deletion counts", async () => {
    discardKnowledgeSource.mockResolvedValue({ ok: true, counts: { knowledgeSources: 1 } });

    const res = fakeRes();

    await handleDiscardKnowledgeSource(res, "ks_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ counts: { knowledgeSources: 1 } });
    expect(discardKnowledgeSource).toHaveBeenCalledWith("ks_1");
  });

  it("should reply 404 for an unknown note", async () => {
    discardKnowledgeSource.mockResolvedValue({ ok: false, error: "not_found" });

    const res = fakeRes();

    await handleDiscardKnowledgeSource(res, "nope");

    expect(res.status).toBe(404);
  });
});
