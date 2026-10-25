import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getKnowledgeBitDetail = vi.fn();

vi.mock("./knowledge-bit-detail.repo.js", () => ({
  getKnowledgeBitDetail: (...args: unknown[]) => getKnowledgeBitDetail(...args),
}));

const { handleGetKnowledgeBitDetail } = await import("./knowledge-bit-detail.controller.js");

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

describe("knowledge bit detail controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer with the piece's full version when it is approved", async () => {
    getKnowledgeBitDetail.mockResolvedValue({ knowledgeBitId: "kb_1" });

    const res = fakeRes();

    await handleGetKnowledgeBitDetail(res, "kb_1");

    expect(getKnowledgeBitDetail).toHaveBeenCalledWith("kb_1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ knowledgeBitId: "kb_1" });
  });

  it("should answer not found for an unknown or unapproved piece", async () => {
    getKnowledgeBitDetail.mockResolvedValue(null);

    const res = fakeRes();

    await handleGetKnowledgeBitDetail(res, "kb_missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
