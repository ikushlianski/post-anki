import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockDetectKnowledgeBits = vi.fn();
const mockEmbedKnowledgeBits = vi.fn();
const mockTagKnowledgeBits = vi.fn();
const mockPlaceKnowledgeBits = vi.fn();
const mockGenerateKnowledgeBitQuestions = vi.fn();
const mockGenerateKnowledgeBitFillBlanks = vi.fn();
const mockEmbedKnowledgeBitQuestionVariants = vi.fn();
const mockListPendingPlacementSuggestions = vi.fn();
const mockResolvePlacementSuggestion = vi.fn();

vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({
  detectKnowledgeBits: (...args: unknown[]) => mockDetectKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-embedding.orchestrator.js", () => ({
  embedKnowledgeBits: (...args: unknown[]) => mockEmbedKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-tagging.orchestrator.js", () => ({
  tagKnowledgeBits: (...args: unknown[]) => mockTagKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-placement.orchestrator.js", () => ({
  placeKnowledgeBits: (...args: unknown[]) => mockPlaceKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-question-generation.orchestrator.js", () => ({
  generateKnowledgeBitQuestions: (...args: unknown[]) => mockGenerateKnowledgeBitQuestions(...args),
}));

vi.mock("./knowledge-bit-fill-blank-generation.orchestrator.js", () => ({
  generateKnowledgeBitFillBlanks: (...args: unknown[]) => mockGenerateKnowledgeBitFillBlanks(...args),
}));

vi.mock("./knowledge-bit-question-variant-embedding.orchestrator.js", () => ({
  embedKnowledgeBitQuestionVariants: (...args: unknown[]) =>
    mockEmbedKnowledgeBitQuestionVariants(...args),
}));

vi.mock("./knowledge-bit-placement.repo.js", () => ({
  listPendingPlacementSuggestions: (...args: unknown[]) =>
    mockListPendingPlacementSuggestions(...args),
  resolvePlacementSuggestion: (...args: unknown[]) => mockResolvePlacementSuggestion(...args),
}));

const {
  handleDetectKnowledgeBits,
  handleTriggerKnowledgeBitEmbeddingScan,
  handleTriggerKnowledgeBitTaggingScan,
  handleTriggerKnowledgeBitPlacementScan,
  handleTriggerKnowledgeBitQuestionGenerationScan,
  handleTriggerKnowledgeBitFillBlankGenerationScan,
  handleTriggerKnowledgeBitQuestionVariantEmbeddingScan,
  handleListPendingPlacementSuggestions,
  handleResolvePlacementSuggestion,
} = await import("./detect-knowledge-bits.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

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

describe("handleTriggerKnowledgeBitTaggingScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockTagKnowledgeBits.mockResolvedValue({ scanned: 3, tagged: 2, failed: 1 });

    const res = fakeRes();
    await handleTriggerKnowledgeBitTaggingScan(res);

    expect(mockTagKnowledgeBits).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scanned: 3, tagged: 2, failed: 1 });
  });

  it("returns 502 with an error message when the scan throws, never a silent 200", async () => {
    mockTagKnowledgeBits.mockRejectedValue(new Error("tagger provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitTaggingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("tagger provider down");
  });

  it("falls back to a generic message when the thrown value is not an Error instance", async () => {
    mockTagKnowledgeBits.mockRejectedValue("boom");

    const res = fakeRes();
    await handleTriggerKnowledgeBitTaggingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { message: string }).message).toBe(
      "knowledge bit tagging scan failed",
    );
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

  it("returns 502 with an error message when the scan throws, never a silent 200", async () => {
    mockGenerateKnowledgeBitQuestions.mockRejectedValue(new Error("question generator provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionGenerationScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("question generator provider down");
  });

  it("falls back to a generic message when the thrown value is not an Error instance", async () => {
    mockGenerateKnowledgeBitQuestions.mockRejectedValue("boom");

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionGenerationScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { message: string }).message).toBe(
      "knowledge bit question generation scan failed",
    );
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

  it("returns 502 with an error message when the scan throws, never a silent 200", async () => {
    mockGenerateKnowledgeBitFillBlanks.mockRejectedValue(new Error("fill blank generator provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitFillBlankGenerationScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("fill blank generator provider down");
  });

  it("falls back to a generic message when the thrown value is not an Error instance", async () => {
    mockGenerateKnowledgeBitFillBlanks.mockRejectedValue("boom");

    const res = fakeRes();
    await handleTriggerKnowledgeBitFillBlankGenerationScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { message: string }).message).toBe(
      "knowledge bit fill blank generation scan failed",
    );
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

  it("returns 502 with an error message when the scan throws, never a silent 200", async () => {
    mockEmbedKnowledgeBitQuestionVariants.mockRejectedValue(new Error("embedding provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionVariantEmbeddingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("embedding provider down");
  });

  it("falls back to a generic message when the thrown value is not an Error instance", async () => {
    mockEmbedKnowledgeBitQuestionVariants.mockRejectedValue("boom");

    const res = fakeRes();
    await handleTriggerKnowledgeBitQuestionVariantEmbeddingScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { message: string }).message).toBe(
      "knowledge bit question variant embedding scan failed",
    );
  });
});

describe("handleTriggerKnowledgeBitPlacementScan", () => {
  it("returns 200 with the scan counts on success", async () => {
    mockPlaceKnowledgeBits.mockResolvedValue({ scanned: 3, matched: 1, suggested: 1, failed: 1 });

    const res = fakeRes();
    await handleTriggerKnowledgeBitPlacementScan(res);

    expect(mockPlaceKnowledgeBits).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scanned: 3, matched: 1, suggested: 1, failed: 1 });
  });

  it("returns 502 with an error message when the scan throws, never a silent 200", async () => {
    mockPlaceKnowledgeBits.mockRejectedValue(new Error("placer provider down"));

    const res = fakeRes();
    await handleTriggerKnowledgeBitPlacementScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("placer provider down");
  });

  it("falls back to a generic message when the thrown value is not an Error instance", async () => {
    mockPlaceKnowledgeBits.mockRejectedValue("boom");

    const res = fakeRes();
    await handleTriggerKnowledgeBitPlacementScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { message: string }).message).toBe(
      "knowledge bit placement scan failed",
    );
  });
});

describe("handleListPendingPlacementSuggestions", () => {
  it("returns 200 with the pending suggestions list", async () => {
    mockListPendingPlacementSuggestions.mockResolvedValue([
      { id: "kb_1", body: "A bit", placementSuggestion: "Try X" },
    ]);

    const res = fakeRes();
    await handleListPendingPlacementSuggestions(res);

    expect(mockListPendingPlacementSuggestions).toHaveBeenCalledWith(200);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "kb_1", body: "A bit", placementSuggestion: "Try X" }]);
  });
});

describe("handleResolvePlacementSuggestion", () => {
  it("returns 400 on an invalid body", async () => {
    const res = fakeRes();
    await handleResolvePlacementSuggestion(fakeReq({ status: "bogus" }), res, "kb_1");

    expect(res.status).toBe(400);
    expect(mockResolvePlacementSuggestion).not.toHaveBeenCalled();
  });

  it("returns 200 with the outcome on a successful reject", async () => {
    mockResolvePlacementSuggestion.mockResolvedValue({ outcome: "rejected" });

    const res = fakeRes();
    await handleResolvePlacementSuggestion(fakeReq({ status: "rejected" }), res, "kb_1");

    expect(mockResolvePlacementSuggestion).toHaveBeenCalledWith(
      "kb_1",
      "rejected",
      undefined,
      undefined,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ outcome: "rejected" });
  });

  it("returns 200 with the created topicId on a successful accept", async () => {
    mockResolvePlacementSuggestion.mockResolvedValue({ outcome: "accepted", topicId: "top_1" });

    const res = fakeRes();
    await handleResolvePlacementSuggestion(
      fakeReq({ status: "accepted", moduleId: "mod_1", title: "New Topic" }),
      res,
      "kb_1",
    );

    expect(mockResolvePlacementSuggestion).toHaveBeenCalledWith(
      "kb_1",
      "accepted",
      "mod_1",
      "New Topic",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ outcome: "accepted", topicId: "top_1" });
  });

  it("returns 404 for not_found", async () => {
    mockResolvePlacementSuggestion.mockResolvedValue({ error: "not_found" });

    const res = fakeRes();
    await handleResolvePlacementSuggestion(fakeReq({ status: "rejected" }), res, "kb_missing");

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("not_found");
  });

  it("returns 404 for module_not_found", async () => {
    mockResolvePlacementSuggestion.mockResolvedValue({ error: "module_not_found" });

    const res = fakeRes();
    await handleResolvePlacementSuggestion(
      fakeReq({ status: "accepted", moduleId: "mod_bad", title: "T" }),
      res,
      "kb_1",
    );

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("module_not_found");
  });

  it("returns 409 for already_resolved", async () => {
    mockResolvePlacementSuggestion.mockResolvedValue({ error: "already_resolved" });

    const res = fakeRes();
    await handleResolvePlacementSuggestion(fakeReq({ status: "rejected" }), res, "kb_1");

    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("already_resolved");
  });

  it("returns 400 when the schema rejects an accept with no moduleId or title", async () => {
    const res = fakeRes();
    await handleResolvePlacementSuggestion(fakeReq({ status: "accepted" }), res, "kb_1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(mockResolvePlacementSuggestion).not.toHaveBeenCalled();
  });

  it("returns 400 when the repo itself reports invalid_input on a schema-valid body", async () => {
    mockResolvePlacementSuggestion.mockResolvedValue({ error: "invalid_input" });

    const res = fakeRes();
    await handleResolvePlacementSuggestion(
      fakeReq({ status: "accepted", moduleId: "mod_1", title: "T" }),
      res,
      "kb_1",
    );

    expect(mockResolvePlacementSuggestion).toHaveBeenCalledWith("kb_1", "accepted", "mod_1", "T");
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
  });
});
