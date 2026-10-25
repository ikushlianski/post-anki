import { describe, expect, it, vi } from "vitest";
import type { DurableStepDeps } from "./durable-extraction.steps.js";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../mastra/knowledge-bit-source-items.agent.js", () => ({ runKnowledgeBitSourceItems: vi.fn() }));
vi.mock("./knowledge-bit.repo.js", () => ({}));
vi.mock("./knowledge-bit-feedback.repo.js", () => ({ loadRecentFeedbackForExtraction: vi.fn() }));
vi.mock("./knowledge-bit-source-items.repo.js", () => ({}));

const { chunkStep, claimStep, failStep, finishStep, planStep, toSnapshot } = await import(
  "./durable-extraction.steps.js"
);
const { itemsForChunk: lessonsForChunk } = await import("./knowledge-bit-source-items.test-mocks.js");

function cardsForChunk(prefix: string, count: number) {
  return { valid: lessonsForChunk(prefix, count), flagged: [] };
}

const CLAIMED_AT = new Date("2026-10-11T12:00:00.000Z");
const SECRET_TEXT = "СЕКРЕТНЫЙ-ТЕКСТ-ИСТОЧНИКА первый абзац.\n\nвторой абзац источника.";

function pending(extractionModelId: string | null = null) {
  return { id: "ks_1", rawText: SECRET_TEXT, extractionModelId, subjectId: null, claimedAt: CLAIMED_AT };
}

function deps(overrides: Partial<DurableStepDeps> = {}): DurableStepDeps {
  return {
    writeItems: vi.fn().mockResolvedValue(lessonsForChunk("A", 1)),
    getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 10, existingStatements: ["old statement"] }),
    insertItems: vi.fn(async (input) => input.items.length),
    markDetected: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    loadFeedbackBlock: vi.fn().mockResolvedValue(""),
    claimOrLoad: vi.fn().mockResolvedValue(pending()),
    loadRawText: vi.fn().mockResolvedValue(SECRET_TEXT),
    ...overrides,
  };
}

const snapshot = toSnapshot(pending());

describe("claimStep", () => {
  it("should store only ids and the claim time, never the source text", async () => {
    const d = deps();

    const result = await claimStep({ sourceId: "ks_1", regeneration: false }, "ks_1:1", d);

    expect(result).toEqual({ id: "ks_1", extractionModelId: null, subjectId: null, claimedAt: "2026-10-11T12:00:00.000Z" });
    expect(JSON.stringify(result)).not.toContain("СЕКРЕТНЫЙ");
    expect(d.claimOrLoad).toHaveBeenCalledWith("ks_1", { regeneration: false, workflowId: "ks_1:1" });
  });

  it("should return nothing when the source is not claimable, so the workflow ends without work", async () => {
    expect(
      await claimStep({ sourceId: "ks_1", regeneration: false }, "ks_1:1", deps({ claimOrLoad: vi.fn().mockResolvedValue(null) })),
    ).toBeNull();
  });
});

describe("planStep", () => {
  it("should fail an empty source with the same reason as the old path", async () => {
    expect(await planStep(snapshot, deps({ loadRawText: vi.fn().mockResolvedValue("   ") }))).toEqual({
      status: "failed",
      reason: "source_empty",
    });
  });

  it("should fail a source that is too long with the same reason as the old path", async () => {
    expect(await planStep(snapshot, deps({ loadRawText: vi.fn().mockResolvedValue("а".repeat(50_001)) }))).toEqual({
      status: "failed",
      reason: "source_too_long",
    });
  });

  it("should return only the chunk count and the first ordinal, with no text", async () => {
    const plan = await planStep(snapshot, deps());

    expect(plan).toEqual({ status: "ready", chunkCount: 1, firstOrdinal: 10 });
    expect(JSON.stringify(plan)).not.toContain("СЕКРЕТНЫЙ");
  });
});

describe("chunkStep", () => {
  it("should read the chunk and the feedback block itself and return only validated drafts", async () => {
    const d = deps({
      loadFeedbackBlock: vi.fn().mockResolvedValue("FEEDBACK-BLOCK"),
      loadRawText: vi.fn().mockResolvedValue("Один абзац исходного текста."),
      writeItems: vi.fn().mockResolvedValue([]),
    });

    await expect(chunkStep(toSnapshot(pending("openrouter/openai/gpt-oss-120b")), 0, d)).rejects.toThrow("no_valid_items");
    expect(d.writeItems).toHaveBeenCalledWith(
      "Один абзац исходного текста.",
      expect.objectContaining({ modelId: "openrouter/openai/gpt-oss-120b", feedbackBlock: "FEEDBACK-BLOCK" }),
    );
  });

  it("should give every model call of a chunk one abort deadline well below the stale cutoff", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const d = deps({
      loadRawText: vi.fn().mockResolvedValue("Один абзац исходного текста."),
      writeItems: vi.fn(async (_chunk: string, options: { abortSignal?: AbortSignal }) => {
        seen.push(options.abortSignal);

        return [];
      }),
    });

    await expect(chunkStep(snapshot, 0, d)).rejects.toThrow("no_valid_items");

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]?.aborted).toBe(false);
  });

  it("should fail when the chunk index is outside the text so a bad plan never calls the model", async () => {
    const d = deps();

    await expect(chunkStep(snapshot, 5, d)).rejects.toThrow("source_chunk_missing");
    expect(d.writeItems).not.toHaveBeenCalled();
  });

  it("should keep extracting when the feedback block cannot be loaded", async () => {
    const d = deps({
      loadFeedbackBlock: vi.fn().mockRejectedValue(new Error("db down")),
      loadRawText: vi.fn().mockResolvedValue("Один абзац исходного текста."),
      writeItems: vi.fn().mockResolvedValue([]),
    });

    await expect(chunkStep(snapshot, 0, d)).rejects.toThrow("no_valid_items");
    expect(d.writeItems).toHaveBeenCalled();
  });
});

describe("finishStep with rejected cards", () => {
  it("should insert a chunk that has only flagged cards and still mark the source detected", async () => {
    const d = deps();
    const flagged = [{ reason: "bad_card" as const, lesson: lessonsForChunk("F", 1)[0]! }];

    const outcome = await finishStep(snapshot, 10, [{ valid: [], flagged }], null, d);

    expect(outcome.status).toBe("detected");
    expect(d.insertItems).toHaveBeenCalledWith(expect.objectContaining({ items: [], flagged }));
  });
});

describe("finishStep", () => {
  it("should insert every chunk at its own ordinal range and mark the source detected", async () => {
    const d = deps();

    const outcome = await finishStep(snapshot, 10, [cardsForChunk("A", 2), cardsForChunk("B", 3)], null, d);

    expect(outcome).toEqual({ status: "detected", inserted: 5, failureReason: null });
    expect(d.insertItems).toHaveBeenNthCalledWith(1, expect.objectContaining({ firstOrdinal: 10 }));
    expect(d.insertItems).toHaveBeenNthCalledWith(2, expect.objectContaining({ firstOrdinal: 1010 }));
    expect(d.markDetected).toHaveBeenCalledWith("ks_1", CLAIMED_AT);
  });

  it("should keep the items of the chunks that worked and mark the source failed with the first failure reason", async () => {
    const d = deps();

    const outcome = await finishStep(snapshot, 10, [cardsForChunk("A", 2), null], "provider timeout", d);

    expect(outcome).toEqual({ status: "failed", inserted: 2, failureReason: "provider timeout" });
    expect(d.markFailed).toHaveBeenCalledWith("ks_1", "provider timeout", CLAIMED_AT);
    expect(d.markDetected).not.toHaveBeenCalled();
  });

  it("should skip statements the source already holds", async () => {
    const duplicate = cardsForChunk("A", 1);
    const d = deps({
      getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 10, existingStatements: [duplicate.valid[0]!.statement] }),
    });

    await finishStep(snapshot, 10, [duplicate, null], null, d);

    expect(d.insertItems).not.toHaveBeenCalled();
  });

  it("should fail loudly when the claim was reclaimed meanwhile, never writing over the new owner", async () => {
    const d = deps({ markDetected: vi.fn().mockResolvedValue(false) });

    await expect(finishStep(snapshot, 10, [cardsForChunk("A", 1), null], null, d)).rejects.toThrow(
      "knowledge_source_reclaimed",
    );
  });
});

describe("failStep", () => {
  it("should mark the source failed with the given reason and report it", async () => {
    const d = deps();

    expect(await failStep(snapshot, "insert exploded", d)).toEqual({
      status: "failed",
      inserted: 0,
      failureReason: "insert exploded",
    });
    expect(d.markFailed).toHaveBeenCalledWith("ks_1", "insert exploded", CLAIMED_AT);
  });
});
