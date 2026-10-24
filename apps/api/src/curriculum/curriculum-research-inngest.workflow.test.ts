import { beforeEach, describe, expect, it, vi } from "vitest";
import { InngestTestEngine } from "@inngest/test";

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

const { curriculumResearchFunction, curriculumResearchTimeoutHandler } = await import(
  "./curriculum-research-inngest.workflow.js"
);
const { prepareResearchStep, gatherResearchStep, finalizeResearchStep } = await import(
  "./curriculum-research.steps.js"
);
const { failResearchJob, failStaleResearchJobs } = await import("./curriculum-research-jobs.repo.js");
const { RESEARCH_SWEEP_CUTOFF_MS, RESEARCH_SWEEP_DELAY } = await import(
  "./curriculum-research-inngest.limits.js"
);

const EVENT = { name: "curriculum/research.requested", data: { curriculumId: "cur_1", retry: false } };

describe("curriculumResearchFunction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(gatherResearchStep).mockResolvedValue({ candidates: 4 });
  });

  it("should prepare, gather and finalize in order", async () => {
    const order: string[] = [];

    vi.mocked(prepareResearchStep).mockImplementation(async () => void order.push("prepare"));
    vi.mocked(gatherResearchStep).mockImplementation(async () => (order.push("gather"), { candidates: 4 }));
    vi.mocked(finalizeResearchStep).mockImplementation(async () => void order.push("finalize"));

    const t = new InngestTestEngine({ function: curriculumResearchFunction });
    const { result } = await t.execute({ events: [EVENT] });

    expect(order).toEqual(["prepare", "gather", "finalize"]);
    expect(result).toEqual({ status: "done", candidates: 4 });
  });

  it("should pass the retry flag to prepare so a retry resolves the doc URL before clearing", async () => {
    const t = new InngestTestEngine({ function: curriculumResearchFunction });

    await t.execute({ events: [{ ...EVENT, data: { curriculumId: "cur_1", retry: true } }] });

    expect(prepareResearchStep).toHaveBeenCalledWith("cur_1", true, undefined);
  });

  it("should not gather again, and so not pay twice, when a restart resumes after gather finished", async () => {
    const t = new InngestTestEngine({ function: curriculumResearchFunction });

    await t.execute({
      events: [EVENT],
      steps: [{ id: "gather", handler: () => ({ candidates: 4 }) }],
    });

    expect(gatherResearchStep).not.toHaveBeenCalled();
    expect(finalizeResearchStep).toHaveBeenCalledTimes(1);
  });

  it("should end without finalizing when gather throws", async () => {
    vi.mocked(gatherResearchStep).mockRejectedValue(new Error("model down"));

    const t = new InngestTestEngine({ function: curriculumResearchFunction });
    const { error } = await t.execute({ events: [EVENT] });

    expect(error).toBeDefined();
    expect(finalizeResearchStep).not.toHaveBeenCalled();
  });

  it("should mark the curriculum failed when the run ends in failure", async () => {
    const onFailure = curriculumResearchFunction.opts.onFailure as (ctx: unknown) => Promise<void>;

    await onFailure({ error: new Error("boom"), event: { data: { event: EVENT } } });

    expect(failResearchJob).toHaveBeenCalledWith("cur_1", undefined);
  });

  it("should not throw from onFailure when the status write fails", async () => {
    vi.mocked(failResearchJob).mockRejectedValue(new Error("db down"));
    const onFailure = curriculumResearchFunction.opts.onFailure as (ctx: unknown) => Promise<void>;

    await expect(
      onFailure({ error: new Error("boom"), event: { data: { event: EVENT } } }),
    ).resolves.toBeUndefined();
  });

  it("should return only counts and status, never source text", async () => {
    const t = new InngestTestEngine({ function: curriculumResearchFunction });
    const { result } = await t.execute({ events: [EVENT] });

    expect(Object.keys(result as object).sort()).toEqual(["candidates", "status"]);
  });
});

describe("curriculumResearchTimeoutHandler", () => {
  it("should wait before sweeping and fail only rows older than the sweep cutoff", async () => {
    const order: string[] = [];
    const sleep = vi.fn(async () => void order.push("sleep"));

    vi.mocked(failStaleResearchJobs).mockImplementation(async () => (order.push("sweep"), 1));

    const t = new InngestTestEngine({
      function: curriculumResearchTimeoutHandler,
      transformCtx: (ctx) => ({ ...ctx, step: { ...ctx.step, sleep } }),
    });
    const { result } = await t.execute({
      events: [
        {
          name: "inngest/function.cancelled",
          data: { function_id: "post-anki-api-curriculum-research", run_id: "R1" },
        },
      ],
    });

    expect(sleep).toHaveBeenCalledWith("wait-for-owners", RESEARCH_SWEEP_DELAY);
    expect(order.slice(0, 2)).toEqual(["sleep", "sweep"]);
    expect(failStaleResearchJobs).toHaveBeenCalledWith(RESEARCH_SWEEP_CUTOFF_MS);
    expect(result).toEqual({ failed: 1 });
  });
});
