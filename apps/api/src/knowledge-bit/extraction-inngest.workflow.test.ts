import { describe, expect, it, vi } from "vitest";
import { InngestTestEngine } from "@inngest/test";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../mastra/knowledge-bit-source-items.agent.js", () => ({
  runKnowledgeBitSourceItems: vi.fn(),
}));

vi.mock("./knowledge-bit.repo.js", () => ({
  claimOrLoadSourceForExtraction: vi.fn(),
  failSourceOwnedByWorkflow: vi.fn().mockResolvedValue(true),
  failSourceByEngineRunId: vi.fn().mockResolvedValue(true),
  getKnowledgeSourceRawText: vi.fn(),
  claimPendingKnowledgeSources: vi.fn(),
  markKnowledgeSourceFailed: vi.fn(),
  markKnowledgeSourceBitsDetected: vi.fn(),
  insertKnowledgeBitsAndMarkDetected: vi.fn(),
  resetStaleProcessingKnowledgeSources: vi.fn(),
  getKnowledgeBitById: vi.fn(),
  insertKnowledgeBits: vi.fn(),
  updateKnowledgeBitBody: vi.fn(),
}));

vi.mock("./knowledge-bit-feedback.repo.js", () => ({
  loadRecentFeedbackForExtraction: vi.fn(),
}));

vi.mock("./knowledge-bit-source-items.repo.js", () => ({
  getSourceInsertState: vi.fn(),
  insertSourceItemsForChunk: vi.fn(),
}));

vi.mock("./durable-extraction.steps.js", () => ({
  claimStep: vi.fn(),
  planStep: vi.fn(),
  chunkStep: vi.fn(),
  failStep: vi.fn(),
  finishStep: vi.fn(),
  toSnapshot: vi.fn(),
  reasonOf: vi.fn(),
}));

const { extractionInngestFunction, extractionCancelHandler } = await import(
  "./extraction-inngest.workflow.js"
);
const { failSourceOwnedByWorkflow, failSourceByEngineRunId } = await import("./knowledge-bit.repo.js");

const EXTRACTION_EVENT_NAME = "knowledge-source/extraction.requested";
const CANCEL_EVENT_NAME = "knowledge-source/extraction.cancel-requested";

const SNAPSHOT = {
  id: "ks_1",
  extractionModelId: null,
  subjectId: null,
  claimedAt: new Date("2026-10-01T10:00:00.000Z").toISOString(),
};

describe("extractionInngestFunction", () => {
  it("should exit cleanly when claim returns null", async () => {
    const t = new InngestTestEngine({ function: extractionInngestFunction });

    const { result } = await t.execute({
      events: [{ name: EXTRACTION_EVENT_NAME, data: { sourceId: "ks_1", run: 1, regeneration: false } }],
      steps: [
        { id: "claim", handler: () => null },
      ],
    });

    expect(result).toEqual({ status: "skipped", inserted: 0, failureReason: null });
  });

  it("should mark source failed when plan reports failure", async () => {
    const t = new InngestTestEngine({ function: extractionInngestFunction });
    const failOutcome = { status: "failed", inserted: 0, failureReason: "source_empty" };

    const { result } = await t.execute({
      events: [{ name: EXTRACTION_EVENT_NAME, data: { sourceId: "ks_1", run: 1, regeneration: false } }],
      steps: [
        { id: "claim", handler: () => SNAPSHOT },
        { id: "plan", handler: () => ({ status: "failed", reason: "source_empty" }) },
        { id: "fail", handler: () => failOutcome },
      ],
    });

    expect(result).toEqual(failOutcome);
  });

  it("should mark source detected when one chunk succeeds", async () => {
    const t = new InngestTestEngine({ function: extractionInngestFunction });
    const detectedOutcome = { status: "detected", inserted: 2, failureReason: null };

    const { result } = await t.execute({
      events: [{ name: EXTRACTION_EVENT_NAME, data: { sourceId: "ks_1", run: 1, regeneration: false } }],
      steps: [
        { id: "claim", handler: () => SNAPSHOT },
        { id: "plan", handler: () => ({ status: "ready", chunkCount: 1, firstOrdinal: 0 }) },
        { id: "chunk-0", handler: () => ({ accepted: 2, inserted: 2 }) },
        { id: "finish", handler: () => detectedOutcome },
        { id: "kick", handler: () => undefined },
      ],
    });

    expect(result).toEqual(detectedOutcome);
  });
});

describe("extractionInngestFunction follow-up passes", () => {
  const runWith = async (outcome: unknown, data: Record<string, unknown> = {}) => {
    const kick = vi.fn().mockReturnValue(undefined);
    const t = new InngestTestEngine({ function: extractionInngestFunction });

    await t.execute({
      events: [{ name: EXTRACTION_EVENT_NAME, data: { sourceId: "ks_1", run: 1, regeneration: false, ...data } }],
      steps: [
        { id: "claim", handler: () => SNAPSHOT },
        { id: "plan", handler: () => ({ status: "ready", chunkCount: 1, firstOrdinal: 0 }) },
        { id: "chunk-0", handler: () => ({ accepted: 2, inserted: 2 }) },
        { id: "finish", handler: () => outcome },
        { id: "kick", handler: kick },
      ],
    });

    return kick;
  };

  it("should queue the follow-up passes once after items were stored", async () => {
    const kick = await runWith({ status: "detected", inserted: 2, failureReason: null });

    expect(kick).toHaveBeenCalledTimes(1);
  });

  it("should not queue them when nothing was extracted", async () => {
    const empty = await runWith({ status: "detected", inserted: 0, failureReason: null });
    const failed = await runWith({ status: "failed", inserted: 0, failureReason: "x" });

    expect(empty).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it("should force at least one item when the regeneration asked for it", async () => {
    const { chunkStep } = await import("./durable-extraction.steps.js");

    vi.mocked(chunkStep).mockResolvedValueOnce({ valid: [], flagged: [], deliberateEmpty: true });

    const t = new InngestTestEngine({ function: extractionInngestFunction });

    await t.execute({
      events: [
        {
          name: EXTRACTION_EVENT_NAME,
          data: { sourceId: "ks_1", run: 1, regeneration: true, forceAtLeastOne: true, modelId: "m1" },
        },
      ],
      steps: [
        { id: "claim", handler: () => SNAPSHOT },
        { id: "plan", handler: () => ({ status: "ready", chunkCount: 1, firstOrdinal: 0 }) },
        { id: "finish", handler: () => ({ status: "detected", inserted: 0, failureReason: null }) },
      ],
    });

    expect(chunkStep).toHaveBeenCalledWith(SNAPSHOT, 0, expect.anything(), { forceAtLeastOne: true, modelId: "m1" });
  });
});

describe("extractionInngestFunction model calls", () => {
  it("should ask the model wrapper not to retry a 429 so only the engine waits and retries", async () => {
    const { claimStep } = await import("./durable-extraction.steps.js");
    const { runKnowledgeBitSourceItems } = await import("../mastra/knowledge-bit-source-items.agent.js");

    vi.mocked(claimStep).mockImplementationOnce(async (_input, _id, deps) => {
      await deps.writeItems("chunk", { modelId: "m" });

      return null;
    });
    vi.mocked(runKnowledgeBitSourceItems).mockResolvedValue([]);

    const t = new InngestTestEngine({ function: extractionInngestFunction });

    await t.execute({
      events: [{ name: EXTRACTION_EVENT_NAME, data: { sourceId: "ks_1", run: 1, regeneration: false } }],
    });

    expect(vi.mocked(runKnowledgeBitSourceItems)).toHaveBeenCalledWith(
      "chunk",
      expect.objectContaining({ modelId: "m", retryRateLimit: false }),
    );
  });
});

describe("extractionCancelHandler", () => {
  it("should mark source failed when cancel event arrives", async () => {
    const t = new InngestTestEngine({ function: extractionCancelHandler });

    await t.execute({
      events: [{ name: CANCEL_EVENT_NAME, data: { sourceId: "ks_1", run: 1 } }],
    });

    expect(vi.mocked(failSourceOwnedByWorkflow)).toHaveBeenCalledWith(
      "ks_1",
      "ks_1:1",
      expect.any(String),
    );
  });

  it("should fail the source that owns the run when the engine cancels a timed-out run", async () => {
    vi.mocked(failSourceByEngineRunId).mockClear();
    const t = new InngestTestEngine({ function: extractionCancelHandler });

    await t.execute({
      events: [{ name: "inngest/function.cancelled", data: { function_id: "post-anki-api-extract-knowledge-source", run_id: "01RUN" } }],
    });

    expect(vi.mocked(failSourceByEngineRunId)).toHaveBeenCalledWith("01RUN", expect.any(String));
    expect(vi.mocked(failSourceOwnedByWorkflow)).not.toHaveBeenCalledWith(expect.anything(), "undefined:undefined", expect.anything());
  });

  it("should leave a regenerated source processing when the engine cancels the superseded old run", async () => {
    vi.mocked(failSourceByEngineRunId).mockReset().mockResolvedValue(false);
    const t = new InngestTestEngine({ function: extractionCancelHandler });

    await t.execute({
      events: [{ name: "inngest/function.cancelled", data: { function_id: "post-anki-api-extract-knowledge-source", run_id: "OLD_RUN" } }],
    });

    expect(vi.mocked(failSourceByEngineRunId)).toHaveBeenCalledWith("OLD_RUN", expect.any(String));
    expect(vi.mocked(failSourceOwnedByWorkflow)).not.toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/:2$/), expect.anything());
  });

  it("should change nothing when the cancelled run owns no source", async () => {
    vi.mocked(failSourceByEngineRunId).mockReset().mockResolvedValue(false);
    vi.mocked(failSourceOwnedByWorkflow).mockClear();
    const t = new InngestTestEngine({ function: extractionCancelHandler });

    await t.execute({
      events: [{ name: "inngest/function.cancelled", data: { function_id: "post-anki-api-extract-knowledge-source", run_id: "unknown" } }],
    });

    expect(vi.mocked(failSourceByEngineRunId)).toHaveBeenCalledWith("unknown", expect.any(String));
    expect(vi.mocked(failSourceOwnedByWorkflow)).not.toHaveBeenCalled();
  });
});
