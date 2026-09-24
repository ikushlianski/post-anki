import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockDetectKnowledgeBits = vi.fn();

vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({
  detectKnowledgeBits: (...args: unknown[]) => mockDetectKnowledgeBits(...args),
}));

const { handleDetectKnowledgeBits } = await import("./detect-knowledge-bits.controller.js");

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleDetectKnowledgeBits", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockDetectKnowledgeBits.mockResolvedValue({ processed: 3, detected: 2, failed: 1 });

    const res = fakeRes();
    await handleDetectKnowledgeBits(res);

    expect(mockDetectKnowledgeBits).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ processed: 3, detected: 2, failed: 1 });
  });

  it("returns 502 with an error message when the scan throws, never a silent 200", async () => {
    mockDetectKnowledgeBits.mockRejectedValue(new Error("provider down"));

    const res = fakeRes();
    await handleDetectKnowledgeBits(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("provider down");
  });

  it("falls back to a generic message when the thrown value is not an Error instance", async () => {
    mockDetectKnowledgeBits.mockRejectedValue("boom");

    const res = fakeRes();
    await handleDetectKnowledgeBits(res);

    expect(res.status).toBe(502);
    expect((res.body as { message: string }).message).toBe(
      "knowledge bit detection scan failed",
    );
  });
});
