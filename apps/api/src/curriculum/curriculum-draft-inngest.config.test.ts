import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("./curriculum-draft.steps.js", () => ({
  beginDraftStep: vi.fn(),
  approveDraftStep: vi.fn(),
  finalizeStaleDraftStep: vi.fn(),
  placeholderDraftStep: vi.fn(),
  draftStep: vi.fn(),
}));
vi.mock("./curriculum-draft-jobs.repo.js", () => ({
  failDraftJob: vi.fn(),
  failStaleDraftJobs: vi.fn(),
}));

const { curriculumDraftFunction } = await import("./curriculum-draft-inngest.workflow.js");
const {
  DRAFT_START_TIMEOUT_MS,
  DRAFT_FINISH_TIMEOUT_MS,
  DRAFT_SWEEP_CUTOFF_MS,
  DRAFT_SWEEP_DELAY_MS,
} = await import("./curriculum-draft-inngest.limits.js");

const MARGIN_MS = 60 * 1000;
const STALLED_AFTER_MS = 5 * 60 * 1000;

describe("curriculumDraftFunction options", () => {
  const opts = curriculumDraftFunction.opts;

  it("should retry a failed step at most once", () => {
    expect(opts.retries).toBe(1);
  });

  it("should run 2 drafts at once and one per course", () => {
    expect(opts.concurrency).toEqual([{ limit: 2 }, { key: "event.data.curriculumId", limit: 1 }]);
  });

  it("should throttle starts because every run makes paid calls", () => {
    expect(opts.throttle).toEqual({ limit: 6, period: "1m", burst: 2 });
  });

  it("should skip a duplicate event for a course already drafting", () => {
    expect(opts.singleton).toEqual({ key: "event.data.curriculumId", mode: "skip" });
  });

  it("should use the declared timeouts and keep finish within 10 minutes", () => {
    expect(opts.timeouts).toEqual({ start: "10m", finish: "10m" });
    expect(DRAFT_FINISH_TIMEOUT_MS).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(DRAFT_FINISH_TIMEOUT_MS).toBeGreaterThan(STALLED_AFTER_MS);
  });

  it("should never sweep a row a queued or live job can still own", () => {
    expect(DRAFT_START_TIMEOUT_MS + MARGIN_MS).toBeLessThanOrEqual(DRAFT_SWEEP_CUTOFF_MS);
    expect(DRAFT_FINISH_TIMEOUT_MS + MARGIN_MS).toBeLessThanOrEqual(DRAFT_SWEEP_CUTOFF_MS);
  });

  it("should always sweep a row whose job timed out while queued or while running", () => {
    const youngestTimedOutAge = Math.min(DRAFT_START_TIMEOUT_MS, DRAFT_FINISH_TIMEOUT_MS) + DRAFT_SWEEP_DELAY_MS;

    expect(youngestTimedOutAge).toBeGreaterThanOrEqual(DRAFT_SWEEP_CUTOFF_MS + MARGIN_MS);
  });
});
