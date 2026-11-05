import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { generateItemsForSource, type GenerateItemsDeps } from "./detect-knowledge-bits.orchestrator.js";
import { chunkStep, toSnapshot, type DurableStepDeps } from "./durable-extraction.steps.js";
import { RU_EXAMPLE_ITEMS } from "./knowledge-bit-source-items.test-mocks.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";

const PARAGRAPH = "word ".repeat(500).trim();
const TEXT = [PARAGRAPH, PARAGRAPH, PARAGRAPH].join("\n\n");
const SECOND_START = PARAGRAPH.length + 2;

const PENDING: PendingKnowledgeSource = {
  id: "ks_1",
  rawText: TEXT,
  extractionModelId: null,
  subjectId: null,
  claimedAt: new Date(1),
};

function buildDeps(overrides: Partial<GenerateItemsDeps> = {}): GenerateItemsDeps {
  return {
    writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS),
    getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 0, existingStatements: [] }),
    insertItems: vi.fn(async (input) => input.items.length),
    markDetected: vi.fn().mockResolvedValue(true),
    markNothingExtracted: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    loadFeedbackBlock: vi.fn().mockResolvedValue(""),
    loadSubjectKind: vi.fn().mockResolvedValue("business"),
    ...overrides,
  };
}

describe("highlights in the extraction pipeline", () => {
  it("should extract only from chunks that hold a mark and pass the marked ranges as focus", async () => {
    const deps = buildDeps({
      loadHighlights: vi.fn().mockResolvedValue([{ start: SECOND_START, end: SECOND_START + 10 }]),
    });

    await generateItemsForSource(PENDING, {}, deps);

    expect(new Set(vi.mocked(deps.writeItems).mock.calls.map(([chunk]) => chunk)).size).toBe(1);
    expect(deps.writeItems).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ focus: [{ start: expect.any(Number), end: expect.any(Number) }] }),
    );
  });

  it("should keep the original chunk position so ordinals stay stable when other chunks are skipped", async () => {
    const deps = buildDeps({
      loadHighlights: vi.fn().mockResolvedValue([{ start: SECOND_START, end: SECOND_START + 10 }]),
    });

    await generateItemsForSource(PENDING, {}, deps);

    const call = vi.mocked(deps.insertItems).mock.calls[0]?.[0];

    expect(call?.firstOrdinal).toBeGreaterThan(0);
  });

  it("should extract every chunk with no focus when nothing is marked", async () => {
    const deps = buildDeps({ loadHighlights: vi.fn().mockResolvedValue([]) });

    await generateItemsForSource(PENDING, {}, deps);

    expect(vi.mocked(deps.writeItems).mock.calls.length).toBeGreaterThan(1);

    for (const [, options] of vi.mocked(deps.writeItems).mock.calls) {
      expect(options.focus).toBeUndefined();
    }
  });

  it("should still extract everything when the marks cannot be loaded", async () => {
    const deps = buildDeps({ loadHighlights: vi.fn().mockRejectedValue(new Error("db down")) });

    const result = await generateItemsForSource(PENDING, {}, deps);

    expect(result.status).toBe("detected");
    expect(vi.mocked(deps.writeItems).mock.calls.length).toBeGreaterThan(1);
  });

  it("should report nothing extracted when marks hold no usable text", async () => {
    const deps = buildDeps({
      loadHighlights: vi.fn().mockResolvedValue([{ start: PARAGRAPH.length, end: PARAGRAPH.length + 2 }]),
    });

    await generateItemsForSource(PENDING, {}, deps);

    expect(deps.writeItems).not.toHaveBeenCalled();
    expect(deps.markNothingExtracted).toHaveBeenCalled();
  });
});

describe("highlights in the durable chunk step", () => {
  function durableDeps(overrides: Partial<DurableStepDeps> = {}): DurableStepDeps {
    return {
      ...buildDeps(),
      claimOrLoad: vi.fn().mockResolvedValue(PENDING),
      loadRawText: vi.fn().mockResolvedValue(TEXT),
      loadHighlights: vi.fn().mockResolvedValue([{ start: SECOND_START, end: SECOND_START + 10 }]),
      ...overrides,
    };
  }

  it("should write a marked chunk with its focus", async () => {
    const deps = durableDeps();
    const index = 1;

    await chunkStep(toSnapshot(PENDING), index, deps);

    expect(deps.writeItems).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ focus: expect.any(Array) }),
    );
  });

  it("should skip an unmarked chunk without calling the model", async () => {
    const deps = durableDeps();

    const cards = await chunkStep(toSnapshot(PENDING), 0, deps);

    expect(cards.deliberateEmpty).toBe(true);
    expect(deps.writeItems).not.toHaveBeenCalled();
  });
});
