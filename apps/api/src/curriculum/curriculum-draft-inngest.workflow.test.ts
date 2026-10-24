import { beforeEach, describe, expect, it, vi } from "vitest";
import { InngestTestEngine } from "@inngest/test";

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

const { curriculumDraftFunction, curriculumDraftTimeoutHandler } = await import(
  "./curriculum-draft-inngest.workflow.js"
);
const steps = await import("./curriculum-draft.steps.js");
const { failDraftJob, failStaleDraftJobs } = await import("./curriculum-draft-jobs.repo.js");
const { DRAFT_SWEEP_CUTOFF_MS, DRAFT_SWEEP_DELAY } = await import("./curriculum-draft-inngest.limits.js");

function event(approve: boolean, retry: boolean) {
  return { name: "curriculum/draft.requested", data: { curriculumId: "cur_1", approve, retry } };
}

describe("curriculumDraftFunction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(steps.placeholderDraftStep).mockResolvedValue("turn_1");
    vi.mocked(steps.draftStep).mockResolvedValue({ status: "done", modules: 3 });
  });

  it("should approve, then placeholder, then draft for an approved-sources request", async () => {
    const order: string[] = [];

    vi.mocked(steps.beginDraftStep).mockImplementation(async () => void order.push("begin"));
    vi.mocked(steps.approveDraftStep).mockImplementation(async () => void order.push("approve"));
    vi.mocked(steps.placeholderDraftStep).mockImplementation(async () => (order.push("placeholder"), "turn_1"));
    vi.mocked(steps.draftStep).mockImplementation(async () => (order.push("draft"), { status: "done", modules: 3 }));

    const t = new InngestTestEngine({ function: curriculumDraftFunction });
    const { result } = await t.execute({ events: [event(true, false)] });

    expect(order).toEqual(["begin", "approve", "placeholder", "draft"]);
    expect(result).toEqual({ status: "done", modules: 3 });
    expect(steps.finalizeStaleDraftStep).not.toHaveBeenCalled();
  });

  it("should finalize a stale pending turn before the placeholder on retry and skip approval", async () => {
    const t = new InngestTestEngine({ function: curriculumDraftFunction });

    await t.execute({ events: [event(false, true)] });

    expect(steps.finalizeStaleDraftStep).toHaveBeenCalledTimes(1);
    expect(steps.approveDraftStep).not.toHaveBeenCalled();
  });

  it("should run neither approve nor finalize-stale for pasted material", async () => {
    const t = new InngestTestEngine({ function: curriculumDraftFunction });

    await t.execute({ events: [event(false, false)] });

    expect(steps.approveDraftStep).not.toHaveBeenCalled();
    expect(steps.finalizeStaleDraftStep).not.toHaveBeenCalled();
    expect(steps.draftStep).toHaveBeenCalledWith("cur_1", "turn_1", undefined);
  });

  it("should reuse the memoized placeholder id and not insert another when resumed", async () => {
    const t = new InngestTestEngine({ function: curriculumDraftFunction });

    await t.execute({
      events: [event(false, false)],
      steps: [{ id: "placeholder", handler: () => "turn_memo" }],
    });

    expect(steps.placeholderDraftStep).not.toHaveBeenCalled();
    expect(steps.draftStep).toHaveBeenCalledWith("cur_1", "turn_memo", undefined);
  });

  it("should not repeat the paid draft when a restart resumes after the draft step finished", async () => {
    const t = new InngestTestEngine({ function: curriculumDraftFunction });

    await t.execute({
      events: [event(false, false)],
      steps: [{ id: "draft", handler: () => ({ status: "done", modules: 3 }) }],
    });

    expect(steps.draftStep).not.toHaveBeenCalled();
  });

  it("should end with a busy result when another draft owns the placeholder", async () => {
    vi.mocked(steps.placeholderDraftStep).mockResolvedValue("busy");
    vi.mocked(steps.draftStep).mockResolvedValue({ status: "busy", modules: 0 });

    const t = new InngestTestEngine({ function: curriculumDraftFunction });
    const { result } = await t.execute({ events: [event(false, false)] });

    expect(result).toEqual({ status: "busy", modules: 0 });
    expect(steps.draftStep).toHaveBeenCalledWith("cur_1", "busy", undefined);
  });

  it("should fail the run when the draft step throws", async () => {
    vi.mocked(steps.draftStep).mockRejectedValue(new Error("model down"));

    const t = new InngestTestEngine({ function: curriculumDraftFunction });
    const { error } = await t.execute({ events: [event(false, false)] });

    expect(error).toBeDefined();
  });

  it("should fail the course and its pending turn when the run ends in failure", async () => {
    const onFailure = curriculumDraftFunction.opts.onFailure as (ctx: unknown) => Promise<void>;

    await onFailure({ error: new Error("boom"), event: { data: { event: event(false, false) } } });

    expect(failDraftJob).toHaveBeenCalledWith("cur_1", undefined);
  });

  it("should not throw from onFailure when the write fails", async () => {
    vi.mocked(failDraftJob).mockRejectedValue(new Error("db down"));
    const onFailure = curriculumDraftFunction.opts.onFailure as (ctx: unknown) => Promise<void>;

    await expect(
      onFailure({ error: new Error("boom"), event: { data: { event: event(false, false) } } }),
    ).resolves.toBeUndefined();
  });

  it("should return only a status and a count, never draft text", async () => {
    const t = new InngestTestEngine({ function: curriculumDraftFunction });
    const { result } = await t.execute({ events: [event(true, false)] });

    expect(Object.keys(result as object).sort()).toEqual(["modules", "status"]);
  });
});

describe("curriculumDraftTimeoutHandler", () => {
  it("should wait before sweeping and sweep with the cutoff", async () => {
    const order: string[] = [];
    const sleep = vi.fn(async () => void order.push("sleep"));

    vi.mocked(failStaleDraftJobs).mockImplementation(async () => (order.push("sweep"), 1));

    const t = new InngestTestEngine({
      function: curriculumDraftTimeoutHandler,
      transformCtx: (ctx) => ({ ...ctx, step: { ...ctx.step, sleep } }),
    });
    const { result } = await t.execute({
      events: [
        {
          name: "inngest/function.cancelled",
          data: { function_id: "post-anki-api-curriculum-draft", run_id: "R1" },
        },
      ],
    });

    expect(sleep).toHaveBeenCalledWith("wait-for-owners", DRAFT_SWEEP_DELAY);
    expect(order.slice(0, 2)).toEqual(["sleep", "sweep"]);
    expect(failStaleDraftJobs).toHaveBeenCalledWith(DRAFT_SWEEP_CUTOFF_MS);
    expect(result).toEqual({ failed: 1 });
  });
});
