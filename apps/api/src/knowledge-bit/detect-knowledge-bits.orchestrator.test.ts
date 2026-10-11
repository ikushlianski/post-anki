import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  CHUNK_CONCURRENCY,
  DETECT_BITS_BATCH_CAP,
  MAX_ITEMS_PER_SOURCE,
  MAX_SOURCE_CHARS,
  ORDINAL_STRIDE_PER_CHUNK,
  STALE_PROCESSING_THRESHOLD_MS,
  detectKnowledgeBits,
  generateItemsForSource,
  type DetectKnowledgeBitsDeps,
  type GenerateItemsDeps,
} from "./detect-knowledge-bits.orchestrator.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";
import { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT } from "./knowledge-bit-source-items.test-mocks.js";
import type { SourceItemDraft } from "./knowledge-bit-source-item-validation.js";

let nextClaimedAt = 0;

function source(id: string, rawText: string | null): PendingKnowledgeSource {
  nextClaimedAt += 1;

  return { id, rawText, claimedAt: new Date(nextClaimedAt) };
}

function paragraphs(count: number): string {
  return Array.from({ length: count }, (_, i) => `P${i} ${"w".repeat(2500)} marker${i}`).join("\n\n");
}

function itemFor(text: string, tag: string): SourceItemDraft {
  return {
    kind: "basic",
    statement: `Claim ${tag} holds for every widget`,
    question: `What holds for every widget in case ${tag}?`,
    answer: `Claim ${tag}`,
    quote: text.slice(0, 40),
  };
}

function buildGenerateDeps(overrides: Partial<GenerateItemsDeps> = {}): GenerateItemsDeps {
  return {
    writeItems: vi.fn(async (chunk: string) => [itemFor(chunk, chunk.slice(0, 4))]),
    getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 0, existingStatements: [] }),
    insertItems: vi.fn(async (input) => input.items.length),
    markDetected: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("generateItemsForSource", () => {
  it("should make exactly one model call for a short paste and store its items", async () => {
    const deps = buildGenerateDeps({
      writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS),
    });
    const pending = source("ks_1", RU_SOURCE_TEXT);

    const result = await generateItemsForSource(pending, {}, deps);

    expect(deps.writeItems).toHaveBeenCalledTimes(1);
    expect(deps.insertItems).toHaveBeenCalledWith({
      sourceId: "ks_1",
      claimedAt: pending.claimedAt,
      firstOrdinal: 0,
      items: RU_EXAMPLE_ITEMS,
    });
    expect(deps.markDetected).toHaveBeenCalledWith("ks_1", pending.claimedAt);
    expect(result).toEqual({ status: "detected", inserted: 4, failureReason: null });
  });

  it("should pass the model chosen for this run to every chunk call", async () => {
    const deps = buildGenerateDeps({ writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS) });

    await generateItemsForSource(source("ks_1", RU_SOURCE_TEXT), { modelId: "m/x" }, deps);

    expect(deps.writeItems).toHaveBeenCalledWith(RU_SOURCE_TEXT.trim(), { modelId: "m/x" });
  });

  it("should start ordinals after the existing ones and give each chunk its own ordinal range", async () => {
    const text = paragraphs(3);
    const deps = buildGenerateDeps({
      getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 7, existingStatements: [] }),
    });

    await generateItemsForSource(source("ks_1", text), {}, deps);

    const ordinals = vi.mocked(deps.insertItems).mock.calls.map(([input]) => input.firstOrdinal);

    expect(ordinals.sort((a, b) => a - b)).toEqual([
      7,
      7 + ORDINAL_STRIDE_PER_CHUNK,
      7 + 2 * ORDINAL_STRIDE_PER_CHUNK,
    ]);
  });

  it("should never run more than three chunk calls at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const deps = buildGenerateDeps({
      writeItems: vi.fn(async (chunk: string) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;

        return [itemFor(chunk, chunk.slice(0, 4))];
      }),
    });

    await generateItemsForSource(source("ks_1", paragraphs(9)), {}, deps);

    expect(deps.writeItems).toHaveBeenCalledTimes(9);
    expect(peak).toBe(CHUNK_CONCURRENCY);
  });

  it("should retry a chunk once when half or more of its items fail quote verification and keep the better attempt", async () => {
    const good = itemFor(RU_SOURCE_TEXT, "good");
    const bad = { ...good, statement: "Claim bad holds for every widget", quote: "цитата которой нет в источнике" };
    const writeItems = vi
      .fn()
      .mockResolvedValueOnce([good, bad])
      .mockResolvedValueOnce([good, { ...good, statement: "Claim second holds for every widget" }]);
    const deps = buildGenerateDeps({ writeItems });

    const result = await generateItemsForSource(source("ks_1", RU_SOURCE_TEXT), {}, deps);

    expect(writeItems).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.insertItems).mock.calls[0]?.[0].items).toHaveLength(2);
    expect(result.status).toBe("detected");
  });

  it("should not retry when fewer than half of the items are dropped", async () => {
    const good = itemFor(RU_SOURCE_TEXT, "good");
    const writeItems = vi.fn().mockResolvedValue([
      good,
      { ...good, statement: "Claim two holds for every widget" },
      { ...good, statement: "Claim three holds for every widget" },
      { ...good, statement: "Claim bad holds for every widget", quote: "цитата которой нет в источнике" },
    ]);
    const deps = buildGenerateDeps({ writeItems });

    await generateItemsForSource(source("ks_1", RU_SOURCE_TEXT), {}, deps);

    expect(writeItems).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.insertItems).mock.calls[0]?.[0].items).toHaveLength(3);
  });

  it("should mark the source failed with no_valid_items when the retry still yields nothing valid", async () => {
    const bad = { ...itemFor(RU_SOURCE_TEXT, "bad"), quote: "цитата которой нет в источнике" };
    const deps = buildGenerateDeps({ writeItems: vi.fn().mockResolvedValue([bad]) });
    const pending = source("ks_1", RU_SOURCE_TEXT);

    const result = await generateItemsForSource(pending, {}, deps);

    expect(deps.writeItems).toHaveBeenCalledTimes(2);
    expect(deps.insertItems).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith("ks_1", "no_valid_items", pending.claimedAt);
    expect(deps.markDetected).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "failed", inserted: 0, failureReason: "no_valid_items" });
  });

  it("should drop items repeating a statement already stored for the source or already taken in this run", async () => {
    const first = itemFor(RU_SOURCE_TEXT, "dup");
    const deps = buildGenerateDeps({
      writeItems: vi.fn().mockResolvedValue([first, { ...first }, itemFor(RU_SOURCE_TEXT, "fresh"), itemFor(RU_SOURCE_TEXT, "kept")]),
      getInsertState: vi
        .fn()
        .mockResolvedValue({ nextOrdinal: 0, existingStatements: ["claim kept holds for EVERY widget"] }),
    });

    await generateItemsForSource(source("ks_1", RU_SOURCE_TEXT), {}, deps);

    expect(vi.mocked(deps.insertItems).mock.calls[0]?.[0].items.map((item) => item.statement)).toEqual([
      "Claim dup holds for every widget",
      "Claim fresh holds for every widget",
    ]);
  });

  it("should store at most 40 items per source and skip chunks once the cap is reached", async () => {
    const writeItems = vi.fn(async (chunk: string) =>
      Array.from({ length: 8 }, (_, i) => itemFor(chunk, `${chunk.slice(0, 4)}-${i}`)),
    );
    const deps = buildGenerateDeps({ writeItems });

    const result = await generateItemsForSource(source("ks_1", paragraphs(12)), {}, deps);

    expect(result.inserted).toBe(MAX_ITEMS_PER_SOURCE);
    expect(writeItems.mock.calls.length).toBeLessThan(12);
    expect(result.status).toBe("detected");
  });

  it("should keep items already inserted but mark the source failed when a later chunk fails", async () => {
    const writeItems = vi.fn(async (chunk: string) => {
      if (chunk.startsWith("P1 ")) {
        throw new Error("openrouter_timeout");
      }

      return [itemFor(chunk, chunk.slice(0, 4))];
    });
    const deps = buildGenerateDeps({ writeItems });
    const pending = source("ks_1", paragraphs(3));

    const result = await generateItemsForSource(pending, {}, deps);

    expect(deps.insertItems).toHaveBeenCalledTimes(2);
    expect(deps.markFailed).toHaveBeenCalledWith("ks_1", "openrouter_timeout", pending.claimedAt);
    expect(deps.markDetected).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "failed", inserted: 2, failureReason: "openrouter_timeout" });
  });

  it("should throw knowledge_source_reclaimed and stop writing when another run took over the source", async () => {
    const deps = buildGenerateDeps({
      insertItems: vi.fn().mockRejectedValue(new Error("knowledge_source_reclaimed")),
    });

    await expect(generateItemsForSource(source("ks_1", paragraphs(9)), {}, deps)).rejects.toThrow(
      "knowledge_source_reclaimed",
    );
    expect(vi.mocked(deps.writeItems).mock.calls.length).toBeLessThan(9);
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.markDetected).not.toHaveBeenCalled();
  });

  it("should throw knowledge_source_reclaimed when the claim is lost before the source is marked detected", async () => {
    const deps = buildGenerateDeps({
      writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS),
      markDetected: vi.fn().mockResolvedValue(false),
    });

    await expect(generateItemsForSource(source("ks_1", RU_SOURCE_TEXT), {}, deps)).rejects.toThrow(
      "knowledge_source_reclaimed",
    );
  });

  it("should fail an empty source without calling the model", async () => {
    const deps = buildGenerateDeps();
    const pending = source("ks_1", "   ");

    const result = await generateItemsForSource(pending, {}, deps);

    expect(deps.writeItems).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith("ks_1", "source_empty", pending.claimedAt);
    expect(result.failureReason).toBe("source_empty");
  });

  it("should fail an oversize source without calling the model", async () => {
    const deps = buildGenerateDeps();

    const result = await generateItemsForSource(source("ks_1", "a".repeat(MAX_SOURCE_CHARS + 1)), {}, deps);

    expect(deps.writeItems).not.toHaveBeenCalled();
    expect(result.failureReason).toBe("source_too_long");
  });
});

function claimOneAtATime(sources: PendingKnowledgeSource[]): DetectKnowledgeBitsDeps["claim"] {
  const queue = [...sources];

  return vi.fn().mockImplementation(async () => {
    const next = queue.shift();

    return next ? [next] : [];
  });
}

function buildDetectDeps(overrides: Partial<DetectKnowledgeBitsDeps>): DetectKnowledgeBitsDeps {
  return {
    claim: vi.fn().mockResolvedValue([]),
    generate: vi.fn().mockResolvedValue({ status: "detected", inserted: 1, failureReason: null }),
    markFailed: vi.fn().mockResolvedValue(true),
    resetStale: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("detectKnowledgeBits", () => {
  it("should return zero counts and never generate when nothing is claimed", async () => {
    const deps = buildDetectDeps({});

    expect(await detectKnowledgeBits(deps)).toEqual({ processed: 0, detected: 0, failed: 0 });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("should reset stale processing sources once, before the claim loop starts", async () => {
    const calls: string[] = [];
    const deps = buildDetectDeps({
      claim: vi.fn().mockImplementation(async () => {
        calls.push("claim");

        return [];
      }),
      resetStale: vi.fn().mockImplementation(async () => {
        calls.push("reset");

        return 0;
      }),
    });

    await detectKnowledgeBits(deps);

    expect(calls).toEqual(["reset", "claim"]);
    expect(deps.resetStale).toHaveBeenCalledWith(STALE_PROCESSING_THRESHOLD_MS);
  });

  it("should count detected and failed sources from the generation outcome", async () => {
    const deps = buildDetectDeps({
      claim: claimOneAtATime([source("a", "text"), source("b", "text")]),
      generate: vi
        .fn()
        .mockResolvedValueOnce({ status: "detected", inserted: 3, failureReason: null })
        .mockResolvedValueOnce({ status: "failed", inserted: 0, failureReason: "no_valid_items" }),
    });

    expect(await detectKnowledgeBits(deps)).toEqual({ processed: 2, detected: 1, failed: 1 });
  });

  it("should mark a source failed when generation throws and carry on with the next one", async () => {
    const first = source("a", "text");
    const deps = buildDetectDeps({
      claim: claimOneAtATime([first, source("b", "text")]),
      generate: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({ status: "detected", inserted: 1, failureReason: null }),
    });

    const result = await detectKnowledgeBits(deps);

    expect(deps.markFailed).toHaveBeenCalledWith("a", "boom", first.claimedAt);
    expect(result).toEqual({ processed: 2, detected: 1, failed: 1 });
  });

  it("should stop after the batch cap", async () => {
    const deps = buildDetectDeps({
      claim: vi.fn().mockImplementation(async () => [source("x", "text")]),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result.processed).toBe(DETECT_BITS_BATCH_CAP);
  });
});
