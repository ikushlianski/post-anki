import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("./curriculum-research.steps.js", () => ({
  prepareResearchStep: vi.fn(),
  gatherResearchStep: vi.fn(),
  finalizeResearchStep: vi.fn(),
}));
vi.mock("./curriculum-research-jobs.repo.js", () => ({
  failResearchJob: vi.fn(),
  failStaleResearchJobs: vi.fn(),
}));

const { curriculumResearchFunction } = await import("./curriculum-research-inngest.workflow.js");
const {
  RESEARCH_START_TIMEOUT_MS,
  RESEARCH_FINISH_TIMEOUT_MS,
  RESEARCH_SWEEP_CUTOFF_MS,
  RESEARCH_SWEEP_DELAY_MS,
} = await import("./curriculum-research-inngest.limits.js");

const MARGIN_MS = 60 * 1000;

describe("curriculumResearchFunction options", () => {
  const opts = curriculumResearchFunction.opts;

  it("should retry a failed step at most once so paid calls are not multiplied", () => {
    expect(opts.retries).toBe(1);
  });

  it("should run 3 courses at once and one run per course", () => {
    expect(opts.concurrency).toEqual([{ limit: 3 }, { key: "event.data.curriculumId", limit: 1 }]);
  });

  it("should throttle starts tightly because every run makes paid model calls", () => {
    expect(opts.throttle).toEqual({ limit: 6, period: "1m", burst: 2 });
    expect(opts.rateLimit).toBeUndefined();
  });

  it("should skip a duplicate event for a course already being researched", () => {
    expect(opts.singleton).toEqual({ key: "event.data.curriculumId", mode: "skip" });
  });

  it("should use the declared timeouts", () => {
    expect(opts.timeouts).toEqual({ start: "15m", finish: "15m" });
  });

  it("should never sweep a row a queued or live job can still own", () => {
    expect(RESEARCH_START_TIMEOUT_MS + MARGIN_MS).toBeLessThanOrEqual(RESEARCH_SWEEP_CUTOFF_MS);
    expect(RESEARCH_FINISH_TIMEOUT_MS + MARGIN_MS).toBeLessThanOrEqual(RESEARCH_SWEEP_CUTOFF_MS);
  });

  it("should always sweep a row whose job timed out while queued or while running", () => {
    const youngestTimedOutAge = Math.min(RESEARCH_START_TIMEOUT_MS, RESEARCH_FINISH_TIMEOUT_MS) + RESEARCH_SWEEP_DELAY_MS;

    expect(youngestTimedOutAge).toBeGreaterThanOrEqual(RESEARCH_SWEEP_CUTOFF_MS + MARGIN_MS);
  });
});
