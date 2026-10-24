import { beforeEach, describe, expect, it, vi } from "vitest";
import { InngestTestEngine } from "@inngest/test";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const detect = vi.fn();
const whQuestion = vi.fn();
const fillBlank = vi.fn();

vi.mock("./knowledge-bit-pipeline-kick.orchestrator.js", () => ({
  KNOWLEDGE_BIT_PIPELINE_PASSES: [
    { name: "detect", run: () => detect() },
    { name: "wh_question", run: () => whQuestion() },
    { name: "fill_blank", run: () => fillBlank() },
  ],
}));

const {
  pipelineKickInngestFunction,
  pipelineKickFollowUpFunction,
  PIPELINE_KICK_RETRIES,
  PIPELINE_KICK_FOLLOW_UP_RATE_LIMIT,
} = await import(
  "./pipeline-kick-inngest.workflow.js"
);

const EVENT = { name: "knowledge-bit/pipeline-kick.requested", data: { requestedAt: 1 } };

describe("pipelineKickInngestFunction", () => {
  beforeEach(() => {
    detect.mockReset().mockResolvedValue({ inserted: 3 });
    whQuestion.mockReset().mockResolvedValue(undefined);
    fillBlank.mockReset().mockResolvedValue(undefined);
  });

  it("should run detect, question and fill-blank passes in order as separate steps", async () => {
    const t = new InngestTestEngine({ function: pipelineKickInngestFunction });

    const { result } = await t.execute({ events: [EVENT] });

    expect(result).toEqual({ detect: "done", wh_question: "done", fill_blank: "done" });
    expect(detect).toHaveBeenCalledTimes(1);
    expect(whQuestion).toHaveBeenCalledTimes(1);
    expect(fillBlank).toHaveBeenCalledTimes(1);
  });

  it("should keep running later passes when one pass fails so one bad pass does not block the rest", async () => {
    whQuestion.mockRejectedValue(new Error("model down"));
    const t = new InngestTestEngine({ function: pipelineKickInngestFunction });

    const { result } = await t.execute({ events: [EVENT] });

    expect(result).toEqual({ detect: "done", wh_question: "failed", fill_blank: "done" });
    expect(fillBlank).toHaveBeenCalledTimes(1);
  });

  it("should not return pass output text in step results", async () => {
    detect.mockResolvedValue({ text: "secret source text" });
    const t = new InngestTestEngine({ function: pipelineKickInngestFunction });

    const { result } = await t.execute({ events: [EVENT] });

    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("should use a low retry count", () => {
    expect(PIPELINE_KICK_RETRIES).toBeLessThanOrEqual(1);
  });

  it("should queue one follow-up kick when a first-time kick run fails", async () => {
    const onFailure = pipelineKickInngestFunction.opts.onFailure as (ctx: unknown) => Promise<void>;
    const sendEvent = vi.fn();

    await onFailure({
      error: new Error("boom"),
      event: { data: { event: { data: { requestedAt: 1 } } } },
      step: { sendEvent },
    });

    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(
      "follow-up-kick",
      expect.objectContaining({ data: expect.objectContaining({ followUp: true }) }),
    );
  });

  it("should not queue another follow-up when the failed run was itself a follow-up", async () => {
    const onFailure = pipelineKickInngestFunction.opts.onFailure as (ctx: unknown) => Promise<void>;
    const sendEvent = vi.fn();

    await onFailure({
      error: new Error("boom"),
      event: { data: { event: { data: { requestedAt: 1, followUp: true } } } },
      step: { sendEvent },
    });

    expect(sendEvent).not.toHaveBeenCalled();
  });
});

describe("pipelineKickFollowUpFunction", () => {
  it("should send one follow-up kick when the engine cancels a timed-out kick run", async () => {
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const t = new InngestTestEngine({
      function: pipelineKickFollowUpFunction,
      transformCtx: (ctx) => ({ ...ctx, step: { ...ctx.step, sendEvent } }),
    });

    await t.execute({
      events: [
        {
          name: "inngest/function.cancelled",
          data: { function_id: "post-anki-api-knowledge-bit-pipeline-kick", run_id: "R1" },
        },
      ],
    });

    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(
      "follow-up-kick",
      expect.objectContaining({
        name: "knowledge-bit/pipeline-kick.requested",
        data: expect.objectContaining({ followUp: true }),
      }),
    );
  });

  it("should cap cancel-triggered follow-ups to one per hour so a repeatedly timing-out kick cannot loop", () => {
    expect(pipelineKickFollowUpFunction.opts.rateLimit).toEqual(PIPELINE_KICK_FOLLOW_UP_RATE_LIMIT);
    expect(PIPELINE_KICK_FOLLOW_UP_RATE_LIMIT).toEqual({ limit: 1, period: "1h" });
  });
});
