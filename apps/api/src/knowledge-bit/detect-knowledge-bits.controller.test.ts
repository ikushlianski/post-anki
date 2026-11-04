import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockDetectKnowledgeBits = vi.fn();
const mockEmbedKnowledgeBits = vi.fn();
const mockTagKnowledgeBits = vi.fn();
const mockGenerateKnowledgeBitQuestions = vi.fn();
const mockGenerateKnowledgeBitFillBlanks = vi.fn();
const mockGenerateKnowledgeBitBasicCards = vi.fn();
const mockEmbedKnowledgeBitQuestionVariants = vi.fn();

vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({
  detectKnowledgeBits: (...args: unknown[]) => mockDetectKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-embedding.orchestrator.js", () => ({
  embedKnowledgeBits: (...args: unknown[]) => mockEmbedKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-tagging.orchestrator.js", () => ({
  tagKnowledgeBits: (...args: unknown[]) => mockTagKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-question-generation.orchestrator.js", () => ({
  generateKnowledgeBitQuestions: (...args: unknown[]) => mockGenerateKnowledgeBitQuestions(...args),
}));

vi.mock("./knowledge-bit-basic-card-generation.orchestrator.js", () => ({
  generateKnowledgeBitBasicCards: (...args: unknown[]) => mockGenerateKnowledgeBitBasicCards(...args),
}));

vi.mock("./knowledge-bit-fill-blank-generation.orchestrator.js", () => ({
  generateKnowledgeBitFillBlanks: (...args: unknown[]) => mockGenerateKnowledgeBitFillBlanks(...args),
}));

vi.mock("./knowledge-bit-question-variant-embedding.orchestrator.js", () => ({
  embedKnowledgeBitQuestionVariants: (...args: unknown[]) =>
    mockEmbedKnowledgeBitQuestionVariants(...args),
}));

const {
  handleDetectKnowledgeBits,
  handleTriggerKnowledgeBitEmbeddingScan,
  handleTriggerKnowledgeBitTaggingScan,
  handleTriggerKnowledgeBitQuestionGenerationScan,
  handleTriggerKnowledgeBitFillBlankGenerationScan,
  handleTriggerKnowledgeBitBasicCardGenerationScan,
  handleTriggerKnowledgeBitQuestionVariantEmbeddingScan,
} = await import("./detect-knowledge-bits.controller.js");

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

  it("returns 502 with a generic message, not the raw error, when the scan throws, never a silent 200", async () => {
    mockDetectKnowledgeBits.mockRejectedValue(new Error("provider down"));

    const res = fakeRes();
    await handleDetectKnowledgeBits(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("An upstream service failed. Try again shortly.");
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

  it("returns 502 with a generic message, not the raw error, when the scan throws, never a silent 200", async () => {
    mockEmbedKnowledgeBits.mockRejectedValue(new Error("embedding provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitEmbeddingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("An upstream service failed. Try again shortly.");
  });
});

describe("handleTriggerKnowledgeBitTaggingScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockTagKnowledgeBits.mockResolvedValue({ scanned: 3, tagged: 2, failed: 1 });

    const res = fakeRes();
    await handleTriggerKnowledgeBitTaggingScan(res);

    expect(mockTagKnowledgeBits).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scanned: 3, tagged: 2, failed: 1 });
  });

  it("returns 502 with a generic message, not the raw error, when the scan throws, never a silent 200", async () => {
    mockTagKnowledgeBits.mockRejectedValue(new Error("tagger provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitTaggingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("An upstream service failed. Try again shortly.");
  });

});

describe("handleTriggerKnowledgeBitQuestionGenerationScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockGenerateKnowledgeBitQuestions.mockResolvedValue({ scanned: 3, generated: 2, failed: 1 });

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionGenerationScan(res);

    expect(mockGenerateKnowledgeBitQuestions).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scanned: 3, generated: 2, failed: 1 });
  });

  it("returns 502 with a generic message, not the raw error, when the scan throws, never a silent 200", async () => {
    mockGenerateKnowledgeBitQuestions.mockRejectedValue(new Error("question generator provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionGenerationScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("An upstream service failed. Try again shortly.");
  });

});

describe("handleTriggerKnowledgeBitFillBlankGenerationScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockGenerateKnowledgeBitFillBlanks.mockResolvedValue({ scanned: 3, generated: 2, failed: 1 });

    const res = fakeRes();
    await handleTriggerKnowledgeBitFillBlankGenerationScan(res);

    expect(mockGenerateKnowledgeBitFillBlanks).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scanned: 3, generated: 2, failed: 1 });
  });

  it("returns 502 with a generic message, not the raw error, when the scan throws, never a silent 200", async () => {
    mockGenerateKnowledgeBitFillBlanks.mockRejectedValue(new Error("fill blank generator provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitFillBlankGenerationScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("An upstream service failed. Try again shortly.");
  });

});

describe("handleTriggerKnowledgeBitBasicCardGenerationScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockGenerateKnowledgeBitBasicCards.mockResolvedValue({ scanned: 3, generated: 2, failed: 1, skipped: 0 });

    const res = fakeRes();
    await handleTriggerKnowledgeBitBasicCardGenerationScan(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scanned: 3, generated: 2, failed: 1, skipped: 0 });
  });

  it("returns 502 with a generic message, not the raw error, when the scan throws, never a silent 200", async () => {
    mockGenerateKnowledgeBitBasicCards.mockRejectedValue(new Error("basic card provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitBasicCardGenerationScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("An upstream service failed. Try again shortly.");
  });
});

describe("handleTriggerKnowledgeBitQuestionVariantEmbeddingScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockEmbedKnowledgeBitQuestionVariants.mockResolvedValue({
      embeddedCount: 2,
      reusedCount: 1,
      capped: false,
    });

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionVariantEmbeddingScan(res);

    expect(mockEmbedKnowledgeBitQuestionVariants).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ embeddedCount: 2, reusedCount: 1, capped: false });
  });

  it("returns 502 with a generic message, not the raw error, when the scan throws, never a silent 200", async () => {
    mockEmbedKnowledgeBitQuestionVariants.mockRejectedValue(new Error("embedding provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionVariantEmbeddingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("An upstream service failed. Try again shortly.");
  });

});
