import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("./curriculum-parse.steps.js", () => ({
  prepareParseStep: vi.fn(),
  synthesizeParseStep: vi.fn(),
}));
vi.mock("./curriculum-research-jobs.repo.js", () => ({
  failResearchJob: vi.fn(),
  failStaleResearchJobs: vi.fn(),
}));

const { curriculumParseFunction } = await import("./curriculum-parse-inngest.workflow.js");
const { PARSE_START_TIMEOUT_MS, PARSE_FINISH_TIMEOUT_MS, PARSE_SWEEP_DELAY_MS } = await import(
  "./curriculum-parse-inngest.limits.js"
);
const { RESEARCH_SWEEP_CUTOFF_MS } = await import("./curriculum-research-inngest.limits.js");

const MARGIN_MS = 60 * 1000;

describe("curriculumParseFunction options", () => {
  const opts = curriculumParseFunction.opts;

  it("should never retry because saving a plan is not safe to repeat", () => {
    expect(opts.retries).toBe(0);
  });

  it("should run 2 parses at once and one per course", () => {
    expect(opts.concurrency).toEqual([{ limit: 2 }, { key: "event.data.curriculumId", limit: 1 }]);
  });

  it("should throttle starts because every run makes a paid call", () => {
    expect(opts.throttle).toEqual({ limit: 6, period: "1m", burst: 2 });
  });

  it("should use the declared timeouts", () => {
    expect(opts.timeouts).toEqual({ start: "15m", finish: "15m" });
  });

  it("should never sweep a course a queued or live job can still own", () => {
    expect(PARSE_START_TIMEOUT_MS + MARGIN_MS).toBeLessThanOrEqual(RESEARCH_SWEEP_CUTOFF_MS);
    expect(PARSE_FINISH_TIMEOUT_MS + MARGIN_MS).toBeLessThanOrEqual(RESEARCH_SWEEP_CUTOFF_MS);
  });

  it("should always sweep a course whose job timed out while queued or running", () => {
    const youngest = Math.min(PARSE_START_TIMEOUT_MS, PARSE_FINISH_TIMEOUT_MS) + PARSE_SWEEP_DELAY_MS;

    expect(youngest).toBeGreaterThanOrEqual(RESEARCH_SWEEP_CUTOFF_MS + MARGIN_MS);
  });
});
