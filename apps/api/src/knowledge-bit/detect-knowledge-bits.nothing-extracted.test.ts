import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../mastra/knowledge-bit-source-items.agent.js", () => ({ runKnowledgeBitSourceItems: vi.fn() }));
vi.mock("./knowledge-bit.repo.js", () => ({}));
vi.mock("./knowledge-bit-feedback.repo.js", () => ({ loadRecentFeedbackForExtraction: vi.fn() }));
vi.mock("./knowledge-bit-source-items.repo.js", () => ({}));
vi.mock("./knowledge-source-nothing-extracted.repo.js", () => ({}));

const { generateItemsForSource, writeAndValidate } = await import("./detect-knowledge-bits.orchestrator.js");
const { chunkStep, finishStep, toSnapshot } = await import("./durable-extraction.steps.js");
const { chunkInsertStep, finishCountsStep } = await import("./extraction-inngest.steps.js");
const { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT } = await import("./knowledge-bit-source-items.test-mocks.js");

import type { DurableStepDeps } from "./durable-extraction.steps.js";
import type { GenerateItemsDeps, WriteOptions } from "./detect-knowledge-bits.orchestrator.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";

const FILLER = "Hi everyone, thanks for coming today. See you next week, have a nice evening.";
const CLAIMED_AT = new Date("2026-10-11T12:00:00.000Z");

function emptyWriter(): GenerateItemsDeps["writeItems"] {
  return vi.fn(async (_chunk: string, options: WriteOptions) => {
    options.onNothingWorthKeeping?.();

    return [] as LessonDraft[];
  });
}

function deps(overrides: Partial<DurableStepDeps> = {}): DurableStepDeps {
  return {
    writeItems: emptyWriter(),
    getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 0, existingStatements: [] }),
    insertItems: vi.fn(async (input) => input.items.length),
    markDetected: vi.fn().mockResolvedValue(true),
    markNothingExtracted: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    loadFeedbackBlock: vi.fn().mockResolvedValue(""),
    claimOrLoad: vi.fn(),
    loadRawText: vi.fn().mockResolvedValue(FILLER),
    ...overrides,
  };
}

function pending(rawText: string): PendingKnowledgeSource {
  return { id: "ks_1", rawText, extractionModelId: null, subjectId: null, claimedAt: CLAIMED_AT };
}

const snapshot = toSnapshot(pending(FILLER));

describe("writeAndValidate with a deliberately empty answer", () => {
  it("should accept the empty answer without a second model call", async () => {
    const d = deps();

    const result = await writeAndValidate(FILLER, {}, d);

    expect(result).toEqual({ valid: [], flagged: [], deliberateEmpty: true });
    expect(d.writeItems).toHaveBeenCalledTimes(1);
  });

  it("should still retry and report no cards when the model returned an empty list without saying it was deliberate", async () => {
    const d = deps({ writeItems: vi.fn().mockResolvedValue([]) });

    const result = await writeAndValidate(FILLER, {}, d);

    expect(result.deliberateEmpty).toBeUndefined();
    expect(d.writeItems).toHaveBeenCalledTimes(2);
  });
});

describe("generateItemsForSource when the note holds nothing worth a card", () => {
  it("should finish the note as nothing extracted, not failed, and write no cards", async () => {
    const d = deps();

    const result = await generateItemsForSource(pending(FILLER), {}, d);

    expect(result).toEqual({ status: "detected", inserted: 0, failureReason: null });
    expect(d.markNothingExtracted).toHaveBeenCalledWith("ks_1", CLAIMED_AT);
    expect(d.markDetected).not.toHaveBeenCalled();
    expect(d.markFailed).not.toHaveBeenCalled();
    expect(d.insertItems).not.toHaveBeenCalled();
  });

  it("should finish normally when a note with a valuable short claim yields a card", async () => {
    const d = deps({ writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS) });

    const result = await generateItemsForSource(pending(RU_SOURCE_TEXT), {}, d);

    expect(result.status).toBe("detected");
    expect(result.inserted).toBeGreaterThan(0);
    expect(d.markDetected).toHaveBeenCalledTimes(1);
    expect(d.markNothingExtracted).not.toHaveBeenCalled();
  });

  it("should not mark nothing extracted when only some of the chunks are empty and the rest yield cards", async () => {
    const calls = { count: 0 };
    const d = deps({
      writeItems: vi.fn(async (_chunk: string, options: WriteOptions) => {
        calls.count += 1;

        if (calls.count === 1) {
          options.onNothingWorthKeeping?.();

          return [];
        }

        return RU_EXAMPLE_ITEMS;
      }),
    });
    const long = Array.from({ length: 4 }, (_, i) => `P${i} ${"w".repeat(2500)}`).join("\n\n");

    await generateItemsForSource(pending(`${RU_SOURCE_TEXT}\n\n${long}`), {}, d);

    expect(d.markDetected).toHaveBeenCalledTimes(1);
    expect(d.markNothingExtracted).not.toHaveBeenCalled();
  });

  it("should keep failing the note with no_valid_items when the model returned nothing without saying it was deliberate", async () => {
    const d = deps({ writeItems: vi.fn().mockResolvedValue([]) });

    const result = await generateItemsForSource(pending(FILLER), {}, d);

    expect(result.failureReason).toBe("no_valid_items");
    expect(d.markNothingExtracted).not.toHaveBeenCalled();
  });
});

describe("durable extraction when the note holds nothing worth a card", () => {
  it("should not fail the chunk and should finish the note as nothing extracted", async () => {
    const d = deps();
    const cards = await chunkStep(snapshot, 0, d);
    const outcome = await finishStep(snapshot, 0, [cards], null, d);

    expect(cards.deliberateEmpty).toBe(true);
    expect(outcome).toEqual({ status: "detected", inserted: 0, failureReason: null });
    expect(d.markNothingExtracted).toHaveBeenCalledWith("ks_1", CLAIMED_AT);
    expect(d.markDetected).not.toHaveBeenCalled();
  });

  it("should finish as an ordinary detected note when any chunk produced cards", async () => {
    const d = deps();
    const outcome = await finishStep(
      snapshot,
      0,
      [{ valid: [], flagged: [], deliberateEmpty: true }, { valid: RU_EXAMPLE_ITEMS, flagged: [] }],
      null,
      d,
    );

    expect(outcome.inserted).toBeGreaterThan(0);
    expect(d.markDetected).toHaveBeenCalledTimes(1);
    expect(d.markNothingExtracted).not.toHaveBeenCalled();
  });
});

describe("inngest extraction when the note holds nothing worth a card", () => {
  it("should report the empty chunk in its counts and finish the note as nothing extracted", async () => {
    const d = deps();
    const counts = await chunkInsertStep(snapshot, 0, 0, 0, d);
    const outcome = await finishCountsStep(snapshot, 0, null, d, true);

    expect(counts).toEqual({ accepted: 0, inserted: 0, deliberateEmpty: true });
    expect(outcome.status).toBe("detected");
    expect(d.markNothingExtracted).toHaveBeenCalledWith("ks_1", CLAIMED_AT);
    expect(d.insertItems).not.toHaveBeenCalled();
  });

  it("should finish normally when cards were inserted even if the flag says every chunk was empty", async () => {
    const d = deps();

    await finishCountsStep(snapshot, 3, null, d, true);

    expect(d.markDetected).toHaveBeenCalledTimes(1);
    expect(d.markNothingExtracted).not.toHaveBeenCalled();
  });

  it("should fail the note, not mark it nothing extracted, when a chunk failed", async () => {
    const d = deps();

    const outcome = await finishCountsStep(snapshot, 0, "no_valid_items", d, true);

    expect(outcome.status).toBe("failed");
    expect(d.markNothingExtracted).not.toHaveBeenCalled();
  });
});

describe("generateItemsForSource when every card was already in the library", () => {
  it("should finish the note as nothing extracted instead of leaving it stuck", async () => {
    const d = deps({
      writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS),
      insertItems: vi.fn(async (input) => {
        if (input.outcome) {
          input.outcome.skippedCards = input.items.length;
        }

        return 0;
      }),
    });

    const result = await generateItemsForSource(pending(RU_SOURCE_TEXT), {}, d);

    expect(result.inserted).toBe(0);
    expect(d.markNothingExtracted).toHaveBeenCalledWith("ks_1", CLAIMED_AT);
    expect(d.markDetected).not.toHaveBeenCalled();
  });
});
