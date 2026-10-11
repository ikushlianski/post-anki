import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));
vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({ detectKnowledgeBits: vi.fn() }));
vi.mock("./knowledge-bit-question-generation.orchestrator.js", () => ({
  generateKnowledgeBitQuestions: vi.fn(),
}));
vi.mock("./knowledge-bit-basic-card-generation.orchestrator.js", () => ({
  generateKnowledgeBitBasicCards: vi.fn(),
}));
vi.mock("./knowledge-bit-fill-blank-generation.orchestrator.js", () => ({
  generateKnowledgeBitFillBlanks: vi.fn(),
}));

const { log } = await import("../shared/log.js");
const { createKnowledgeBitPipelineKick, KNOWLEDGE_BIT_PIPELINE_STAGES } = await import(
  "./knowledge-bit-pipeline-kick.orchestrator.js"
);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

function nextTick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("knowledge bit pipeline kick", () => {
  it("should run split first, then the three card writers as one concurrent stage", () => {
    expect(KNOWLEDGE_BIT_PIPELINE_STAGES.map((stage) => stage.map((pass) => pass.name))).toEqual([
      ["detect"],
      ["wh_question", "fill_blank", "basic_card"],
    ]);
  });

  it("should run the stages in order on a fresh kick", async () => {
    const order: string[] = [];
    const kick = createKnowledgeBitPipelineKick([
      [{ name: "a", run: async () => order.push("a") }],
      [{ name: "b", run: async () => order.push("b") }],
    ]);

    await kick();

    expect(order).toEqual(["a", "b"]);
  });

  it("should run the passes of one stage concurrently and start the next stage only after they all finish", async () => {
    const gate = deferred();
    const started: string[] = [];
    const kick = createKnowledgeBitPipelineKick([
      [
        {
          name: "a",
          run: async () => {
            started.push("a");
            await gate.promise;
          },
        },
        {
          name: "b",
          run: async () => {
            started.push("b");
            await gate.promise;
          },
        },
      ],
      [{ name: "c", run: async () => started.push("c") }],
    ]);

    const running = kick();
    await nextTick();

    expect(started).toEqual(["a", "b"]);

    gate.resolve();
    await running;

    expect(started).toEqual(["a", "b", "c"]);
  });

  it("should still run later passes and log the pass name when one fails", async () => {
    const second = vi.fn().mockResolvedValue(undefined);
    const kick = createKnowledgeBitPipelineKick([
      [{ name: "a", run: () => Promise.reject(new Error("llm down")) }],
      [{ name: "b", run: second }],
    ]);

    await expect(kick()).resolves.toBeUndefined();

    expect(second).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ pass: "a" }),
      "knowledge_bit_pipeline_kick_pass_failed",
    );
  });

  it("should let a failing writer pass not block its sibling passes in the same stage", async () => {
    const sibling = vi.fn().mockResolvedValue(undefined);
    const kick = createKnowledgeBitPipelineKick([
      [
        { name: "wh_question", run: () => Promise.reject(new Error("wh down")) },
        { name: "fill_blank", run: sibling },
      ],
    ]);

    await expect(kick()).resolves.toBeUndefined();

    expect(sibling).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ pass: "wh_question" }),
      "knowledge_bit_pipeline_kick_pass_failed",
    );
  });

  it("should never overlap runs and cover ten mid-run pastes with exactly one follow-up", async () => {
    const gate = deferred();
    let active = 0;
    let maxActive = 0;
    const run = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active -= 1;
    });
    const kick = createKnowledgeBitPipelineKick([[{ name: "a", run }]]);
    const first = kick();

    for (let i = 0; i < 10; i += 1) {
      void kick();
    }

    gate.resolve();
    await first;

    expect(run).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it("should start a fresh run after everything has finished", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const kick = createKnowledgeBitPipelineKick([[{ name: "a", run }]]);

    await kick();
    await kick();

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("should accept new runs after a pass threw", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const kick = createKnowledgeBitPipelineKick([[{ name: "a", run }]]);

    await kick();
    await kick();

    expect(run).toHaveBeenCalledTimes(2);
  });
});
