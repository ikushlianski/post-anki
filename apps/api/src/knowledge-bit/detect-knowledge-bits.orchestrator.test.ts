import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  detectKnowledgeBits,
  DETECT_BITS_BATCH_CAP,
  MAX_SOURCE_CHARS,
  STALE_PROCESSING_THRESHOLD_MS,
  type DetectKnowledgeBitsDeps,
} from "./detect-knowledge-bits.orchestrator.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";

let nextClaimedAt = 0;

function source(id: string, rawText: string | null): PendingKnowledgeSource {
  nextClaimedAt += 1;

  return { id, rawText, claimedAt: new Date(nextClaimedAt) };
}

function claimOneAtATime(sources: PendingKnowledgeSource[]): DetectKnowledgeBitsDeps["claim"] {
  const queue = [...sources];

  return vi.fn().mockImplementation(async () => {
    const next = queue.shift();

    return next ? [next] : [];
  });
}

function buildDeps(overrides: Partial<DetectKnowledgeBitsDeps>): DetectKnowledgeBitsDeps {
  return {
    claim: vi.fn().mockResolvedValue([]),
    detect: vi.fn(),
    insertBitsAndMarkDetected: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(true),
    resetStale: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("detectKnowledgeBits", () => {
  it("returns zero counts and never calls the detector when nothing is claimed", async () => {
    const deps = buildDeps({});

    const result = await detectKnowledgeBits(deps);

    expect(result).toEqual({ processed: 0, detected: 0, failed: 0 });
    expect(deps.detect).not.toHaveBeenCalled();
  });

  it("resets stale processing sources once, before the claim loop starts", async () => {
    const calls: string[] = [];
    const deps = buildDeps({
      claim: vi.fn().mockImplementation(async () => {
        calls.push("claim");

        return [];
      }),
      resetStale: vi.fn().mockImplementation(async (staleAfterMs: number) => {
        calls.push(`resetStale:${staleAfterMs}`);

        return 0;
      }),
    });

    await detectKnowledgeBits(deps);

    expect(deps.resetStale).toHaveBeenCalledTimes(1);
    expect(deps.resetStale).toHaveBeenCalledWith(STALE_PROCESSING_THRESHOLD_MS);
    expect(calls[0]).toBe(`resetStale:${STALE_PROCESSING_THRESHOLD_MS}`);
  });

  it("detects bits for every claimed source on the happy path", async () => {
    const deps = buildDeps({
      claim: claimOneAtATime([source("s1", "First source text."), source("s2", "Second source text.")]),
      detect: vi
        .fn()
        .mockResolvedValueOnce([
          { text: "bit a", background: null },
          { text: "bit b", background: null },
        ])
        .mockResolvedValueOnce([{ text: "bit c", background: null }]),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result).toEqual({ processed: 2, detected: 2, failed: 0 });
    expect(deps.insertBitsAndMarkDetected).toHaveBeenCalledWith(
      "s1",
      [
        { text: "bit a", background: null },
        { text: "bit b", background: null },
      ],
      expect.any(Date),
    );
    expect(deps.insertBitsAndMarkDetected).toHaveBeenCalledWith(
      "s2",
      [{ text: "bit c", background: null }],
      expect.any(Date),
    );
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("marks an oversized source failed with source_too_long and never calls the detector", async () => {
    const oversized = "x".repeat(50_001);
    const deps = buildDeps({
      claim: claimOneAtATime([source("big", oversized)]),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result).toEqual({ processed: 1, detected: 0, failed: 1 });
    expect(deps.detect).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith("big", "source_too_long", expect.any(Date));
  });

  it("marks an empty or null source failed with source_empty and never calls the detector", async () => {
    const deps = buildDeps({
      claim: claimOneAtATime([source("empty1", ""), source("empty2", null)]),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result).toEqual({ processed: 2, detected: 0, failed: 2 });
    expect(deps.detect).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith("empty1", "source_empty", expect.any(Date));
    expect(deps.markFailed).toHaveBeenCalledWith("empty2", "source_empty", expect.any(Date));
  });

  it("isolates one source's provider error from the rest of the batch", async () => {
    const deps = buildDeps({
      claim: claimOneAtATime([source("bad", "Will fail."), source("good", "Will succeed.")]),
      detect: vi
        .fn()
        .mockRejectedValueOnce(new Error("provider rate limited"))
        .mockResolvedValueOnce([{ text: "a fine bit", background: null }]),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result).toEqual({ processed: 2, detected: 1, failed: 1 });
    expect(deps.markFailed).toHaveBeenCalledWith("bad", "provider rate limited", expect.any(Date));
    expect(deps.insertBitsAndMarkDetected).toHaveBeenCalledWith(
      "good",
      [{ text: "a fine bit", background: null }],
      expect.any(Date),
    );
    expect(deps.insertBitsAndMarkDetected).not.toHaveBeenCalledWith(
      "bad",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps processing the rest of the batch when marking one source failed itself throws", async () => {
    const deps = buildDeps({
      claim: claimOneAtATime([source("bad", "Will fail."), source("good", "Will succeed.")]),
      detect: vi
        .fn()
        .mockRejectedValueOnce(new Error("provider rate limited"))
        .mockResolvedValueOnce([{ text: "a fine bit", background: null }]),
      markFailed: vi.fn().mockRejectedValueOnce(new Error("db write failed")),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result).toEqual({ processed: 2, detected: 1, failed: 1 });
    expect(deps.insertBitsAndMarkDetected).toHaveBeenCalledWith(
      "good",
      [{ text: "a fine bit", background: null }],
      expect.any(Date),
    );
  });

  it("accepts a source exactly at the length limit without marking it too long", async () => {
    const boundary = "x".repeat(MAX_SOURCE_CHARS);
    const deps = buildDeps({
      claim: claimOneAtATime([source("boundary", boundary)]),
      detect: vi.fn().mockResolvedValueOnce([{ text: "a bit", background: null }]),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result).toEqual({ processed: 1, detected: 1, failed: 0 });
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("claims one source at a time and stops after the batch cap even with more pending", async () => {
    const claim = vi
      .fn()
      .mockImplementation(async () => [source(`s-${Math.random()}`, "Some source text.")]);
    const deps = buildDeps({
      claim,
      detect: vi.fn().mockResolvedValue([{ text: "a bit", background: null }]),
    });

    const result = await detectKnowledgeBits(deps);

    expect(result.processed).toBe(DETECT_BITS_BATCH_CAP);
    expect(claim).toHaveBeenCalledTimes(DETECT_BITS_BATCH_CAP);
    expect(claim).toHaveBeenCalledWith(1);
  });
});
