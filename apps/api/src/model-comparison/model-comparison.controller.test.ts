import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estimate = vi.fn();
const runModelComparison = vi.fn();
const saveComparisonRun = vi.fn();
const listComparisonRuns = vi.fn();
const getComparisonRun = vi.fn();
const gradeModelResult = vi.fn();
const gradeComparisonCard = vi.fn();

vi.mock("./model-comparison-cost.js", () => ({
  estimateModelComparisonCost: (...args: unknown[]) => estimate(...args),
}));

vi.mock("./model-comparison.runner.js", () => ({
  runModelComparison: (...args: unknown[]) => runModelComparison(...args),
}));

vi.mock("./model-comparison.repo.js", () => ({
  saveComparisonRun: (...args: unknown[]) => saveComparisonRun(...args),
  listComparisonRuns: (...args: unknown[]) => listComparisonRuns(...args),
  getComparisonRun: (...args: unknown[]) => getComparisonRun(...args),
  gradeModelResult: (...args: unknown[]) => gradeModelResult(...args),
  gradeComparisonCard: (...args: unknown[]) => gradeComparisonCard(...args),
}));

const {
  handleCreateModelComparisonRun,
  handleEstimateModelComparison,
  handleGetModelComparisonRun,
  handleGradeComparisonCard,
  handleGradeModelResult,
  handleListModelComparisonRuns,
} = await import("./model-comparison.controller.js");

const RUN_ID = "5b0e7a4e-3c8d-4d4e-9d54-0d5f7f4c0a11";
const HAIKU = encodeURIComponent("openrouter/anthropic/claude-haiku-5.5");
const VALID_BODY = { excerpt: "Redis хранит данные в памяти.", modelIds: ["openrouter/anthropic/claude-haiku-5.5"] };

function fakeReq(body: unknown): http.IncomingMessage {
  return new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  }) as unknown as http.IncomingMessage;
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

describe("model comparison controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estimate.mockReturnValue({ perModel: [], totalEstimatedCostUsd: 0.01, chunkCount: 1, withinCap: true });
    runModelComparison.mockResolvedValue({ runId: RUN_ID, startedAt: "2026-10-11T00:00:00Z", results: [] });
    getComparisonRun.mockResolvedValue({ runId: RUN_ID, results: [] });
  });

  it("should reject an estimate request with no model chosen", async () => {
    const res = fakeRes();

    await handleEstimateModelComparison(fakeReq({ excerpt: "text", modelIds: [] }), res);

    expect(res.status).toBe(400);
  });

  it("should reject a model id that is not on the allowlist", async () => {
    const res = fakeRes();

    await handleCreateModelComparisonRun(fakeReq({ excerpt: "text", modelIds: ["openrouter/evil/model"] }), res);

    expect(res.status).toBe(400);
    expect(runModelComparison).not.toHaveBeenCalled();
  });

  it("should reject an excerpt over the character cap", async () => {
    const res = fakeRes();

    await handleCreateModelComparisonRun(fakeReq({ ...VALID_BODY, excerpt: "а".repeat(6001) }), res);

    expect(res.status).toBe(400);
  });

  it("should refuse to run when the estimated cost passes the cap, without calling any model", async () => {
    estimate.mockReturnValue({ perModel: [], totalEstimatedCostUsd: 9, chunkCount: 2, withinCap: false });
    const res = fakeRes();

    await handleCreateModelComparisonRun(fakeReq(VALID_BODY), res);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "over_cost_cap" });
    expect(runModelComparison).not.toHaveBeenCalled();
    expect(saveComparisonRun).not.toHaveBeenCalled();
  });

  it("should run, save and return the stored run when the cost is within the cap", async () => {
    const res = fakeRes();

    await handleCreateModelComparisonRun(fakeReq(VALID_BODY), res);

    expect(res.status).toBe(201);
    expect(saveComparisonRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: RUN_ID, excerpt: VALID_BODY.excerpt, estimatedCostUsd: 0.01 }),
    );
  });

  it("should save the per-model estimate with each result so a later view can compare it to the actual cost", async () => {
    estimate.mockReturnValue({
      perModel: [
        { modelId: "openrouter/openai/gpt-oss-120b", inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.0004 },
        { modelId: "openrouter/anthropic/claude-haiku-5.5", inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.0009 },
      ],
      totalEstimatedCostUsd: 0.0013,
      chunkCount: 1,
      withinCap: true,
    });
    const res = fakeRes();

    await handleCreateModelComparisonRun(fakeReq(VALID_BODY), res);

    expect(saveComparisonRun).toHaveBeenCalledWith(
      expect.objectContaining({
        perModelEstimatedCostUsd: {
          "openrouter/openai/gpt-oss-120b": 0.0004,
          "openrouter/anthropic/claude-haiku-5.5": 0.0009,
        },
      }),
    );
    expect(res.body).toMatchObject({ runId: RUN_ID });
  });

  it("should list the latest runs", async () => {
    listComparisonRuns.mockResolvedValue([{ runId: RUN_ID }]);
    const res = fakeRes();

    await handleListModelComparisonRuns(res);

    expect(listComparisonRuns).toHaveBeenCalledWith(20);
    expect(res.body).toEqual([{ runId: RUN_ID }]);
  });

  it("should answer not found for a run id that is not a uuid or does not exist", async () => {
    const bad = fakeRes();
    const missing = fakeRes();

    getComparisonRun.mockResolvedValue(null);
    await handleGetModelComparisonRun(bad, "not-a-uuid");
    await handleGetModelComparisonRun(missing, RUN_ID);

    expect(bad.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it.each([0, 6, 2.5])("should reject an extraction grade of %s", async (extractionRating) => {
    const res = fakeRes();

    await handleGradeModelResult(fakeReq({ extractionRating }), res, RUN_ID, HAIKU);

    expect(res.status).toBe(400);
    expect(gradeModelResult).not.toHaveBeenCalled();
  });

  it("should reject a grade request that changes nothing", async () => {
    const res = fakeRes();

    await handleGradeModelResult(fakeReq({}), res, RUN_ID, HAIKU);

    expect(res.status).toBe(400);
  });

  it("should save an extraction grade with a note for a decoded model id", async () => {
    gradeModelResult.mockResolvedValue("ok");
    const res = fakeRes();

    await handleGradeModelResult(fakeReq({ extractionRating: 4, note: "missed the hedge" }), res, RUN_ID, HAIKU);

    expect(gradeModelResult).toHaveBeenCalledWith(RUN_ID, "openrouter/anthropic/claude-haiku-5.5", {
      extractionRating: 4,
      note: "missed the hedge",
    });
    expect(res.status).toBe(200);
  });

  it("should answer not found for an unknown model id in the path", async () => {
    const res = fakeRes();

    await handleGradeModelResult(fakeReq({ extractionRating: 3 }), res, RUN_ID, encodeURIComponent("openrouter/evil/model"));

    expect(res.status).toBe(404);
  });

  it.each([0, 6])("should reject a card quality grade of %s", async (rating) => {
    const res = fakeRes();

    await handleGradeComparisonCard(fakeReq({ rating }), res, RUN_ID, HAIKU, "0");

    expect(res.status).toBe(400);
    expect(gradeComparisonCard).not.toHaveBeenCalled();
  });

  it("should save a card grade at the given card position", async () => {
    gradeComparisonCard.mockResolvedValue("ok");
    const res = fakeRes();

    await handleGradeComparisonCard(fakeReq({ rating: 5, wordingRating: 2 }), res, RUN_ID, HAIKU, "3");

    expect(gradeComparisonCard).toHaveBeenCalledWith(RUN_ID, "openrouter/anthropic/claude-haiku-5.5", 3, {
      rating: 5,
      wordingRating: 2,
    });
    expect(res.status).toBe(200);
  });

  it("should answer not found for a card position that is not a small whole number", async () => {
    const res = fakeRes();

    await handleGradeComparisonCard(fakeReq({ rating: 3 }), res, RUN_ID, HAIKU, "-1");

    expect(res.status).toBe(404);
  });

  it("should answer not found when the card does not exist in the stored result", async () => {
    gradeComparisonCard.mockResolvedValue("not_found");
    const res = fakeRes();

    await handleGradeComparisonCard(fakeReq({ rating: 3 }), res, RUN_ID, HAIKU, "7");

    expect(res.status).toBe(404);
  });
});
