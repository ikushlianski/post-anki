import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./cards-compile.orchestrator.js", () => ({ generateAndStoreCards: vi.fn() }));
vi.mock("./cards-embedding.orchestrator.js", () => ({ embedVariantsForTopic: vi.fn() }));
vi.mock("./cards.repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cards.repo.js")>()),
  touchGeneratingCards: vi.fn(),
  setCardsStatus: vi.fn(),
  failStaleGeneratingCards: vi.fn(),
}));

const { cardsCompileFunction, CARDS_TIMEOUT_SWEEP_CUTOFF_MS } = await import("./cards-inngest.workflow.js");
const { CARDS_COMPILE_FINISH_TIMEOUT_MS, CARDS_COMPILE_START_TIMEOUT_MS, CARDS_TIMEOUT_SWEEP_DELAY_MS } = await import(
  "./cards-inngest.limits.js"
);
const { GENERATING_STALE_THRESHOLD_MS } = await import("./cards.repo.js");

describe("cardsCompileFunction options", () => {
  const opts = cardsCompileFunction.opts;

  it("should retry a failed step at most once so paid model calls are not multiplied", () => {
    expect(opts.retries).toBe(1);
  });

  it("should run at most 3 topics at once and one run per topic", () => {
    expect(opts.concurrency).toEqual([{ limit: 3 }, { key: "event.data.topicId", limit: 1 }]);
  });

  it("should bound the start rate and queue bursts instead of dropping them", () => {
    expect(opts.throttle).toEqual({ limit: 30, period: "1m", burst: 3 });
    expect(opts.rateLimit).toBeUndefined();
  });

  it("should skip a duplicate event for a topic that is already running", () => {
    expect(opts.singleton).toEqual({ key: "event.data.topicId", mode: "skip" });
  });

  it("should cap queue wait and run time below the stale-claim window so a second trigger cannot pay twice", () => {
    expect(opts.timeouts).toEqual({ start: "14m", finish: "10m" });
    expect(CARDS_COMPILE_START_TIMEOUT_MS).toBeLessThan(GENERATING_STALE_THRESHOLD_MS);
    expect(CARDS_COMPILE_FINISH_TIMEOUT_MS).toBeLessThan(GENERATING_STALE_THRESHOLD_MS);
  });

  it("should sweep only rows older than the stale-claim window that no queued or running job can still own", () => {
    expect(CARDS_TIMEOUT_SWEEP_CUTOFF_MS).toBe(GENERATING_STALE_THRESHOLD_MS);
  });

  it("should wait long enough after a timeout that the timed-out row is past the stale-claim window", () => {
    expect(CARDS_COMPILE_FINISH_TIMEOUT_MS + CARDS_TIMEOUT_SWEEP_DELAY_MS).toBeGreaterThan(
      GENERATING_STALE_THRESHOLD_MS,
    );
    expect(CARDS_COMPILE_START_TIMEOUT_MS + CARDS_TIMEOUT_SWEEP_DELAY_MS).toBeGreaterThan(
      GENERATING_STALE_THRESHOLD_MS,
    );
  });
});
