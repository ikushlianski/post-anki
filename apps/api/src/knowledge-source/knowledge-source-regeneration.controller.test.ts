import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimSourceForRegeneration = vi.fn();
const getKnowledgeSourceRegenerationStatus = vi.fn();
const generateItemsForSource = vi.fn();

vi.mock("./knowledge-source-regeneration.repo.js", () => ({
  claimSourceForRegeneration: (...args: unknown[]) => claimSourceForRegeneration(...args),
  getKnowledgeSourceRegenerationStatus: (...args: unknown[]) =>
    getKnowledgeSourceRegenerationStatus(...args),
}));
vi.mock("../knowledge-bit/detect-knowledge-bits.orchestrator.js", () => ({
  generateItemsForSource: (...args: unknown[]) => generateItemsForSource(...args),
}));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { handleRegenerateKnowledgeSource, handleGetKnowledgeSourceRegeneration } = await import(
  "./knowledge-source-regeneration.controller.js"
);

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

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

const source = { id: "ks_1", rawText: "text", claimedAt: new Date() };

describe("handleRegenerateKnowledgeSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateItemsForSource.mockResolvedValue({ status: "detected", inserted: 1, failureReason: null });
  });

  it("should reply 202 with the superseded count and start generation with the chosen model", async () => {
    claimSourceForRegeneration.mockResolvedValue({ ok: true, source, supersededCount: 3 });

    const res = fakeRes();

    await handleRegenerateKnowledgeSource(
      fakeReq({ modelId: "openrouter/google/gemini-2.5-flash-lite" }),
      res,
      "ks_1",
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "running", supersededCount: 3 });
    expect(generateItemsForSource).toHaveBeenCalledWith(source, {
      modelId: "openrouter/google/gemini-2.5-flash-lite",
    });
  });

  it("should accept an empty body and use the default model", async () => {
    claimSourceForRegeneration.mockResolvedValue({ ok: true, source, supersededCount: 0 });

    const res = fakeRes();

    await handleRegenerateKnowledgeSource(fakeReq(undefined), res, "ks_1");

    expect(res.status).toBe(202);
    expect(generateItemsForSource).toHaveBeenCalledWith(source, { modelId: undefined });
  });

  it("should reject a model outside the allowlist with 400 and claim nothing", async () => {
    const res = fakeRes();

    await handleRegenerateKnowledgeSource(fakeReq({ modelId: "openrouter/evil/model" }), res, "ks_1");

    expect(res.status).toBe(400);
    expect(claimSourceForRegeneration).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["already_running", 409],
    ["source_text_missing", 422],
  ])("should reply %s as %i and run no generation", async (error, status) => {
    claimSourceForRegeneration.mockResolvedValue({ ok: false, error });

    const res = fakeRes();

    await handleRegenerateKnowledgeSource(fakeReq({}), res, "ks_1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
    expect(generateItemsForSource).not.toHaveBeenCalled();
  });

  it("should still reply 202 when the background run throws", async () => {
    claimSourceForRegeneration.mockResolvedValue({ ok: true, source, supersededCount: 0 });
    generateItemsForSource.mockRejectedValue(new Error("boom"));

    const res = fakeRes();

    await handleRegenerateKnowledgeSource(fakeReq({}), res, "ks_1");

    expect(res.status).toBe(202);
  });
});

describe("handleGetKnowledgeSourceRegeneration", () => {
  it("should return the status", async () => {
    getKnowledgeSourceRegenerationStatus.mockResolvedValue({ status: "failed", failureReason: "x" });

    const res = fakeRes();

    await handleGetKnowledgeSourceRegeneration(res, "ks_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "failed", failureReason: "x" });
  });

  it("should return 404 for an unknown source", async () => {
    getKnowledgeSourceRegenerationStatus.mockResolvedValue(null);

    const res = fakeRes();

    await handleGetKnowledgeSourceRegeneration(res, "nope");

    expect(res.status).toBe(404);
  });
});
