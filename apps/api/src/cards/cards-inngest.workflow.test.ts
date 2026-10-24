import { beforeEach, describe, expect, it, vi } from "vitest";
import { InngestTestEngine } from "@inngest/test";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { cardsCompiler: "cardsCompiler" },
  getMastra: () => ({ getAgent: () => ({ generate: vi.fn() }) }),
}));

vi.mock("./cards-compile.orchestrator.js", () => ({
  generateAndStoreCards: vi.fn(),
}));

vi.mock("./cards-embedding.orchestrator.js", () => ({
  embedVariantsForTopic: vi.fn(),
}));

vi.mock("./cards.repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cards.repo.js")>()),
  touchGeneratingCards: vi.fn(),
  setCardsStatus: vi.fn(),
  failStaleGeneratingCards: vi.fn(),
}));

const { cardsCompileFunction, cardsCompileTimeoutHandler, CARDS_TIMEOUT_SWEEP_CUTOFF_MS } = await import("./cards-inngest.workflow.js");
const { generateAndStoreCards } = await import("./cards-compile.orchestrator.js");
const { embedVariantsForTopic } = await import("./cards-embedding.orchestrator.js");
const { touchGeneratingCards, setCardsStatus, failStaleGeneratingCards } = await import("./cards.repo.js");
const { CARDS_TIMEOUT_SWEEP_DELAY } = await import("./cards-inngest.limits.js");

const EVENT = { name: "cards/compile.requested", data: { topicId: "topic_1" } };

describe("cardsCompileFunction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(touchGeneratingCards).mockResolvedValue(true);
    vi.mocked(generateAndStoreCards).mockResolvedValue(3);
    vi.mocked(embedVariantsForTopic).mockResolvedValue(undefined as never);
  });

  it("should begin, compile and embed in order and call the model path once", async () => {
    const order: string[] = [];

    vi.mocked(touchGeneratingCards).mockImplementation(async () => (order.push("begin"), true));
    vi.mocked(generateAndStoreCards).mockImplementation(async () => (order.push("compile"), 3));
    vi.mocked(embedVariantsForTopic).mockImplementation(async () => {
      order.push("embed");
    });

    const t = new InngestTestEngine({ function: cardsCompileFunction });
    const { result } = await t.execute({ events: [EVENT] });

    expect(order).toEqual(["begin", "compile", "embed"]);
    expect(result).toEqual({ status: "done", cards: 3 });
    expect(generateAndStoreCards).toHaveBeenCalledTimes(1);
  });

  it("should skip without paying for a model call when the topic is no longer generating", async () => {
    vi.mocked(touchGeneratingCards).mockResolvedValue(false);

    const t = new InngestTestEngine({ function: cardsCompileFunction });
    const { result } = await t.execute({ events: [EVENT] });

    expect(result).toEqual({ status: "skipped", cards: 0 });
    expect(generateAndStoreCards).not.toHaveBeenCalled();
  });

  it("should not call the model again when a restart resumes after the compile step finished", async () => {
    const t = new InngestTestEngine({ function: cardsCompileFunction });

    await t.execute({
      events: [EVENT],
      steps: [{ id: "compile", handler: () => ({ cards: 3 }) }],
    });

    expect(generateAndStoreCards).not.toHaveBeenCalled();
    expect(embedVariantsForTopic).toHaveBeenCalledTimes(1);
  });

  it("should still finish successfully when embedding fails because cards work without embeddings", async () => {
    vi.mocked(embedVariantsForTopic).mockRejectedValue(new Error("embed down"));

    const t = new InngestTestEngine({ function: cardsCompileFunction });
    const { result, error } = await t.execute({ events: [EVENT] });

    expect(error).toBeUndefined();
    expect(result).toEqual({ status: "done", cards: 3 });
    expect(setCardsStatus).not.toHaveBeenCalled();
  });

  it("should fail the run when compile throws", async () => {
    vi.mocked(generateAndStoreCards).mockRejectedValue(new Error("model down"));

    const t = new InngestTestEngine({ function: cardsCompileFunction });
    const { error } = await t.execute({ events: [EVENT] });

    expect(error).toBeDefined();
    expect(embedVariantsForTopic).not.toHaveBeenCalled();
  });

  it("should mark the card set failed when the run ends in failure", async () => {
    const onFailure = cardsCompileFunction.opts.onFailure as (ctx: unknown) => Promise<void>;

    await onFailure({ error: new Error("boom"), event: { data: { event: EVENT } } });

    expect(setCardsStatus).toHaveBeenCalledWith("topic_1", "failed");
  });

  it("should not throw from onFailure when the status write fails", async () => {
    vi.mocked(setCardsStatus).mockRejectedValue(new Error("db down"));
    const onFailure = cardsCompileFunction.opts.onFailure as (ctx: unknown) => Promise<void>;

    await expect(
      onFailure({ error: new Error("boom"), event: { data: { event: EVENT } } }),
    ).resolves.toBeUndefined();
  });

  it("should not put card text in the run result", async () => {
    vi.mocked(generateAndStoreCards).mockResolvedValue(2);

    const t = new InngestTestEngine({ function: cardsCompileFunction });
    const { result } = await t.execute({ events: [EVENT] });

    expect(Object.keys(result as object).sort()).toEqual(["cards", "status"]);
  });
});

describe("cardsCompileTimeoutHandler", () => {
  it("should wait before sweeping and fail only sets older than the stale-claim window", async () => {
    vi.mocked(failStaleGeneratingCards).mockResolvedValue(2);
    const order: string[] = [];
    const sleep = vi.fn(async () => {
      order.push("sleep");
    });

    vi.mocked(failStaleGeneratingCards).mockImplementation(async () => (order.push("sweep"), 2));

    const t = new InngestTestEngine({
      function: cardsCompileTimeoutHandler,
      transformCtx: (ctx) => ({ ...ctx, step: { ...ctx.step, sleep } }),
    });
    const { result } = await t.execute({
      events: [
        {
          name: "inngest/function.cancelled",
          data: { function_id: "post-anki-api-cards-compile", run_id: "R1" },
        },
      ],
    });

    expect(sleep).toHaveBeenCalledWith("wait-for-owners", CARDS_TIMEOUT_SWEEP_DELAY);
    expect(order.slice(0, 2)).toEqual(["sleep", "sweep"]);
    expect(failStaleGeneratingCards).toHaveBeenCalledWith(CARDS_TIMEOUT_SWEEP_CUTOFF_MS);
    expect(result).toEqual({ failed: 2 });
  });
});
