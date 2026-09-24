import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockDetectKnowledgeBits = vi.fn();
const mockEmbedKnowledgeBits = vi.fn();

vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({
  detectKnowledgeBits: (...args: unknown[]) => mockDetectKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-embedding.orchestrator.js", () => ({
  embedKnowledgeBits: (...args: unknown[]) => mockEmbedKnowledgeBits(...args),
}));

const { handleDetectKnowledgeBits, handleTriggerKnowledgeBitEmbeddingScan } = await import(
  "./detect-knowledge-bits.controller.js"
);

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

describe("handleTriggerKnowledgeBitEmbeddingScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockEmbedKnowledgeBits.mockResolvedValue({
      embeddedCount: 2,
      reusedCount: 1,
      capped: false,
    });

    const res = fakeRes();
    await handleTriggerKnowledgeBitEmbeddingScan(res);

    expect(mockEmbedKnowledgeBits).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ embeddedCount: 2, reusedCount: 1, capped: false });
  });

  it("returns 502 with an error message when the scan throws, never a silent 200", async () => {
    mockEmbedKnowledgeBits.mockRejectedValue(new Error("embedding provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitEmbeddingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("embedding provider down");
  });
});
