import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./knowledge-bit.repo.js", () => ({
  getKnowledgeBitById: vi.fn(),
}));

vi.mock("./knowledge-bit-generate-variants.orchestrator.js", () => ({
  generateKnowledgeBitVariants: vi.fn(),
}));

const { getKnowledgeBitById } = await import("./knowledge-bit.repo.js");
const { generateKnowledgeBitVariants } = await import(
  "./knowledge-bit-generate-variants.orchestrator.js"
);
const { handleGenerateKnowledgeBitVariants } = await import(
  "./knowledge-bit-generate-variants.controller.js"
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

describe("handleGenerateKnowledgeBitVariants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return 202 and kick off generation asynchronously when the bit exists", async () => {
    vi.mocked(getKnowledgeBitById).mockResolvedValue({
      id: "kb_1",
      body: "TTL means time to live.",
      approvalState: "approved",
      isAiGenerated: false,
      sourceLinks: [],
    });
    vi.mocked(generateKnowledgeBitVariants).mockResolvedValue({
      basicCards: { scanned: 1, generated: 1, failed: 0, skipped: 0 },
      fillBlanks: { scanned: 1, generated: 1, failed: 0, skipped: 0 },
    });

    const res = fakeRes();

    await handleGenerateKnowledgeBitVariants(res, "kb_1");

    expect(res.status).toBe(202);
  });

  it("should return 404 when the bit does not exist", async () => {
    vi.mocked(getKnowledgeBitById).mockResolvedValue(null);

    const res = fakeRes();

    await handleGenerateKnowledgeBitVariants(res, "kb_missing");

    expect(res.status).toBe(404);
    expect(generateKnowledgeBitVariants).not.toHaveBeenCalled();
  });
});
