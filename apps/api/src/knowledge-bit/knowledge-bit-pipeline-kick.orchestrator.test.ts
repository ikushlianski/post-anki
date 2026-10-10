import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));
vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({ detectKnowledgeBits: vi.fn() }));
vi.mock("./knowledge-bit-question-generation.orchestrator.js", () => ({
  generateKnowledgeBitQuestions: vi.fn(),
}));
vi.mock("./knowledge-bit-fill-blank-generation.orchestrator.js", () => ({
  generateKnowledgeBitFillBlanks: vi.fn(),
}));

const { log } = await import("../shared/log.js");
const { createKnowledgeBitPipelineKick, KNOWLEDGE_BIT_PIPELINE_PASSES } = await import(
  "./knowledge-bit-pipeline-kick.orchestrator.js"
);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

describe("knowledge bit pipeline kick", () => {
  it("should run split, then questions, then fill-in-the-blank cards", () => {
    expect(KNOWLEDGE_BIT_PIPELINE_PASSES.map((p) => p.name)).toEqual(["detect", "wh_question", "fill_blank"]);
  });

  it("should run the passes in order on a fresh kick", async () => {
    const order: string[] = [];
    const kick = createKnowledgeBitPipelineKick([
      { name: "a", run: async () => order.push("a") },
      { name: "b", run: async () => order.push("b") },
    ]);

    await kick();

    expect(order).toEqual(["a", "b"]);
  });

  it("should still run later passes and log the pass name when one fails", async () => {
    const second = vi.fn().mockResolvedValue(undefined);
    const kick = createKnowledgeBitPipelineKick([
      { name: "a", run: () => Promise.reject(new Error("llm down")) },
      { name: "b", run: second },
    ]);

    await expect(kick()).resolves.toBeUndefined();

    expect(second).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ pass: "a" }),
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
    const kick = createKnowledgeBitPipelineKick([{ name: "a", run }]);
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
    const kick = createKnowledgeBitPipelineKick([{ name: "a", run }]);

    await kick();
    await kick();

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("should accept new runs after a pass threw", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const kick = createKnowledgeBitPipelineKick([{ name: "a", run }]);

    await kick();
    await kick();

    expect(run).toHaveBeenCalledTimes(2);
  });
});
