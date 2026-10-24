import { describe, expect, it, vi } from "vitest";
import type { DurableStepDeps } from "./durable-extraction.steps.js";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../mastra/knowledge-bit-source-items.agent.js", () => ({ runKnowledgeBitSourceItems: vi.fn() }));
vi.mock("./knowledge-bit.repo.js", () => ({}));
vi.mock("./knowledge-bit-feedback.repo.js", () => ({ loadRecentFeedbackForExtraction: vi.fn() }));
vi.mock("./knowledge-bit-source-items.repo.js", () => ({}));

const { chunkInsertStep, finishCountsStep } = await import("./extraction-inngest.steps.js");
const { toSnapshot } = await import("./durable-extraction.steps.js");
const { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT } = await import("./knowledge-bit-source-items.test-mocks.js");

const CLAIMED_AT = new Date("2026-10-11T12:00:00.000Z");
const snapshot = toSnapshot({ id: "ks_1", rawText: null, extractionModelId: null, subjectId: null, claimedAt: CLAIMED_AT });

function deps(overrides: Partial<DurableStepDeps> = {}): DurableStepDeps {
  return {
    writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS.slice(0, 2)),
    getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 10, existingStatements: [] }),
    insertItems: vi.fn(async (input) => input.items.length),
    markDetected: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    loadFeedbackBlock: vi.fn().mockResolvedValue(""),
    claimOrLoad: vi.fn(),
    loadRawText: vi.fn().mockResolvedValue(RU_SOURCE_TEXT),
    ...overrides,
  };
}

describe("chunkInsertStep", () => {
  it("should write the chunk's items to the database and return only counts", async () => {
    const d = deps();

    const result = await chunkInsertStep(snapshot, 0, 10, 0, d);

    expect(result).toEqual({ accepted: 2, inserted: 2 });
    expect(d.insertItems).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "ks_1", firstOrdinal: 10 }));
    expect(JSON.stringify(result)).not.toContain(RU_EXAMPLE_ITEMS[0]!.statement);
  });

  it("should skip statements the source already holds", async () => {
    const [first] = RU_EXAMPLE_ITEMS;
    const d = deps({
      getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 10, existingStatements: [first!.statement] }),
    });

    const result = await chunkInsertStep(snapshot, 0, 10, 0, d);

    expect(result.accepted).toBe(1);
  });

  it("should insert nothing once the per-source cap is reached", async () => {
    const d = deps();

    expect(await chunkInsertStep(snapshot, 0, 10, 10_000, d)).toEqual({ accepted: 0, inserted: 0 });
    expect(d.insertItems).not.toHaveBeenCalled();
  });
});

describe("finishCountsStep", () => {
  it("should mark the source detected and report only the count", async () => {
    const d = deps();

    expect(await finishCountsStep(snapshot, 5, null, d)).toEqual({ status: "detected", inserted: 5, failureReason: null });
    expect(d.markDetected).toHaveBeenCalledWith("ks_1", CLAIMED_AT);
  });

  it("should mark the source failed when any chunk failed, keeping the items that were saved", async () => {
    const d = deps();

    expect(await finishCountsStep(snapshot, 3, "extraction_failed", d)).toEqual({
      status: "failed",
      inserted: 3,
      failureReason: "extraction_failed",
    });
    expect(d.markDetected).not.toHaveBeenCalled();
  });

  it("should fail loudly when the claim was reclaimed meanwhile", async () => {
    await expect(
      finishCountsStep(snapshot, 1, null, deps({ markDetected: vi.fn().mockResolvedValue(false) })),
    ).rejects.toThrow("knowledge_source_reclaimed");
  });
});
