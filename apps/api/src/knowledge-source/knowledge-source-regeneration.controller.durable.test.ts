import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClaim = vi.fn();
const mockGenerate = vi.fn();
const mockStart = vi.fn();
const mockEnabled = vi.fn();

vi.mock("./knowledge-source-regeneration.repo.js", () => ({
  claimSourceForRegeneration: (...args: unknown[]) => mockClaim(...args),
  getKnowledgeSourceRegenerationStatus: vi.fn(),
}));
vi.mock("../knowledge-bit/detect-knowledge-bits.orchestrator.js", () => ({
  generateItemsForSource: (...args: unknown[]) => mockGenerate(...args),
}));
vi.mock("../knowledge-bit/durable-extraction.starter.js", () => ({
  isDurableExtractionEnabled: () => mockEnabled(),
  startDurableExtraction: (...args: unknown[]) => mockStart(...args),
}));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

const { handleRegenerateKnowledgeSource } = await import("./knowledge-source-regeneration.controller.js");

const SOURCE = { id: "ks_1", rawText: "text", extractionModelId: null, subjectId: null, claimedAt: new Date() };

function fakeReq(body: unknown): http.IncomingMessage {
  return new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  }) as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & { status: number | null } {
  const res = {
    status: null as number | null,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end: () => undefined,
  };

  return res as unknown as http.ServerResponse & { status: number | null };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClaim.mockResolvedValue({ ok: true, source: SOURCE, supersededCount: 0 });
  mockGenerate.mockResolvedValue({ status: "detected", inserted: 1, failureReason: null });
});

describe("regeneration and the durable extraction flag", () => {
  it("should regenerate in the request process exactly as before while the flag is off", async () => {
    mockEnabled.mockReturnValue(false);
    const res = fakeRes();

    await handleRegenerateKnowledgeSource(fakeReq({ modelId: "openrouter/openai/gpt-oss-120b" }), res, "ks_1");
    await flush();

    expect(res.status).toBe(202);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("should hand the claimed source to a workflow and not generate in process when the flag is on", async () => {
    mockEnabled.mockReturnValue(true);
    mockStart.mockResolvedValue({ started: ["ks_1:2"], fallbackIds: [] });

    await handleRegenerateKnowledgeSource(fakeReq({ modelId: "openrouter/openai/gpt-oss-120b" }), fakeRes(), "ks_1");
    await flush();

    expect(mockStart).toHaveBeenCalledWith(["ks_1"], { regeneration: true });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("should fall back to in-process generation when the workflow could not start", async () => {
    mockEnabled.mockReturnValue(true);
    mockStart.mockResolvedValue({ started: [], fallbackIds: ["ks_1"] });

    await handleRegenerateKnowledgeSource(fakeReq({ modelId: "openrouter/openai/gpt-oss-120b" }), fakeRes(), "ks_1");
    await flush();

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("should fall back to in-process generation when starting throws", async () => {
    mockEnabled.mockReturnValue(true);
    mockStart.mockRejectedValue(new Error("engine down"));

    await handleRegenerateKnowledgeSource(fakeReq({ modelId: "openrouter/openai/gpt-oss-120b" }), fakeRes(), "ks_1");
    await flush();

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
