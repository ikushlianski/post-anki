import { describe, expect, it, vi } from "vitest";

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
}));

vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({
  defaultGenerateItemsDeps: vi.fn(() => ({})),
  CHUNK_MAX_CHARS: 1000,
  MAX_ITEMS_PER_CHUNK: 8,
  MAX_ITEMS_PER_SOURCE: 40,
  ORDINAL_STRIDE_PER_CHUNK: 1000,
}));

vi.mock("./durable-extraction.steps.js", () => ({
  claimStep: vi.fn(),
  planStep: vi.fn(),
  chunkStep: vi.fn(),
  failStep: vi.fn(),
}));

const { extractionInngestFunction, extractionCancelHandler } = await import("./extraction-inngest.workflow.js");

describe("extractionInngestFunction options", () => {
  const opts = extractionInngestFunction.opts;

  it("should cancel a run that sits too long so a stuck extraction cannot stay processing forever", () => {
    expect(opts.timeouts).toEqual({ start: "30m", finish: "30m" });
  });

  it("should retry a failed step at most once so paid model calls are not multiplied", () => {
    expect(opts.retries).toBe(1);
  });

  it("should queue bursts of extraction starts instead of dropping them", () => {
    expect(opts.throttle).toMatchObject({ limit: 10, period: "1m" });
    expect(opts.rateLimit).toBeUndefined();
  });

  it("should let a newer run for a source cancel the active one so a regeneration is never silently skipped", () => {
    expect(opts.singleton).toEqual({ key: "event.data.sourceId", mode: "cancel" });
  });

  it("should dedupe by event id, which carries the run number, so a later regeneration is a new run", () => {
    expect(opts.idempotency).toBe("event.id");
  });
});

describe("extractionCancelHandler triggers", () => {
  it("should also react to the engine cancelling an extraction run so the source ends failed", () => {
    const triggers = extractionCancelHandler.opts.triggers ?? [];
    const cancelled = triggers.find(
      (trigger) => "event" in trigger && trigger.event === "inngest/function.cancelled",
    );

    expect(cancelled).toMatchObject({ if: expect.stringContaining("extract-knowledge-source") });
  });
});
