import { describe, it, expect, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({
  detectKnowledgeBits: vi.fn().mockResolvedValue({}),
}));

vi.mock("./knowledge-bit-question-generation.orchestrator.js", () => ({
  generateKnowledgeBitQuestions: vi.fn().mockResolvedValue({}),
}));

vi.mock("./knowledge-bit-fill-blank-generation.orchestrator.js", () => ({
  generateKnowledgeBitFillBlanks: vi.fn().mockResolvedValue({}),
}));

import { createKnowledgeBitPipelineKick } from "./knowledge-bit-pipeline-kick.orchestrator.js";

function makePass(name: string, impl?: () => Promise<unknown>) {
  return { name, run: impl ?? vi.fn().mockResolvedValue({ processed: 1 }) };
}

describe("createKnowledgeBitPipelineKick", () => {
  describe("pass ordering", () => {
    it("should run all passes in the order they are given", async () => {
      const order: string[] = [];
      const passes = [
        { name: "a", run: async () => { order.push("a"); } },
        { name: "b", run: async () => { order.push("b"); } },
        { name: "c", run: async () => { order.push("c"); } },
      ];
      const kick = createKnowledgeBitPipelineKick(passes);

      await kick();

      expect(order).toEqual(["a", "b", "c"]);
    });
  });

  describe("pass isolation", () => {
    it("should run later passes even when an earlier pass throws", async () => {
      const order: string[] = [];
      const passes = [
        { name: "a", run: async () => { order.push("a"); throw new Error("fail-a"); } },
        { name: "b", run: async () => { order.push("b"); } },
        { name: "c", run: async () => { order.push("c"); } },
      ];
      const kick = createKnowledgeBitPipelineKick(passes);

      await kick();

      expect(order).toEqual(["a", "b", "c"]);
    });

    it("should not reject even when every pass throws", async () => {
      const passes = [
        { name: "a", run: async () => { throw new Error("fail-a"); } },
        { name: "b", run: async () => { throw new Error("fail-b"); } },
      ];
      const kick = createKnowledgeBitPipelineKick(passes);

      await expect(kick()).resolves.toBeUndefined();
    });
  });

  describe("coalescing", () => {
    it("should start a fresh run when called while idle", async () => {
      const pass = makePass("a");
      const kick = createKnowledgeBitPipelineKick([pass]);

      await kick();
      vi.mocked(pass.run).mockClear();
      await kick();

      expect(pass.run).toHaveBeenCalledOnce();
    });

    it("should queue at most one follow-up run when kicked multiple times mid-run", async () => {
      const resolvers: Array<() => void> = [];
      let callCount = 0;
      const pass = {
        name: "slow",
        run: () =>
          new Promise<void>((res) => {
            callCount += 1;
            resolvers.push(res);
          }),
      };
      const kick = createKnowledgeBitPipelineKick([pass]);

      kick();

      kick();
      kick();
      kick();

      expect(callCount).toBe(1);

      resolvers[0]!();

      await new Promise<void>((res) => setTimeout(res, 0));

      expect(callCount).toBe(2);

      resolvers[1]!();

      await new Promise<void>((res) => setTimeout(res, 0));

      expect(callCount).toBe(2);
    });

    it("should not queue a third run when only one follow-up is in flight", async () => {
      let resolveFirst!: () => void;
      let callCount = 0;
      const pass = {
        name: "slow",
        run: () =>
          new Promise<void>((res) => {
            callCount += 1;
            if (callCount === 1) {
              resolveFirst = res;
            } else {
              res();
            }
          }),
      };
      const kick = createKnowledgeBitPipelineKick([pass]);

      const p1 = kick();

      kick();

      resolveFirst();
      await p1;

      await new Promise<void>((res) => setTimeout(res, 0));

      expect(callCount).toBe(2);
    });
  });

  describe("guard reset", () => {
    it("should set current to null after a successful run so a later kick starts fresh", async () => {
      const pass = makePass("a");
      const kick = createKnowledgeBitPipelineKick([pass]);

      await kick();

      const second = kick();

      expect(second).not.toBe(undefined);
      await second;
      expect(vi.mocked(pass.run)).toHaveBeenCalledTimes(2);
    });

    it("should reset the busy guard even when a pass throws, so the next kick is not stuck", async () => {
      let callCount = 0;
      const pass = {
        name: "failing",
        run: async () => {
          callCount += 1;
          if (callCount === 1) throw new Error("first run fails");
        },
      };
      const kick = createKnowledgeBitPipelineKick([pass]);

      await kick();
      await kick();

      expect(callCount).toBe(2);
    });
  });
});
