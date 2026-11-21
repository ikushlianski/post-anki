import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const recorded: { outcome: "ok" | "failed" }[] = [];

vi.mock("../shared/env.js", () => ({ loadEnv: () => ({}) }));
vi.mock("./mastra.js", () => ({
  AGENT_KEYS: { knownCardsJudge: "knownCardsJudge" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));
vi.mock("./model.js", () => ({ resolveAgentModel: vi.fn() }));
vi.mock("./generate-with-retry.js", () => ({
  recordGenerateCall: vi.fn(async (_op: string, _cid: null, _key: string, fn: () => Promise<unknown>) => {
    try {
      const result = await fn();

      recorded.push({ outcome: "ok" });

      return result;
    } catch (err) {
      recorded.push({ outcome: "failed" });

      throw err;
    }
  }),
}));

const { runKnownCardsJudge } = await import("./known-cards-judge.agent.js");

beforeEach(() => {
  recorded.length = 0;
  generate.mockReset();
});

describe("runKnownCardsJudge", () => {
  it("should record the call as failed when the judge answer does not match the schema", async () => {
    generate.mockResolvedValue({ object: { candidates: [{ alias: "K1" }] } });

    await expect(runKnownCardsJudge("p", "src")).rejects.toThrow("known_cards_invalid_output");
    expect(recorded).toEqual([{ outcome: "failed" }]);
  });

  it("should record the call as ok and return the verdicts for a valid answer", async () => {
    const candidates = [{ alias: "K1", verdict: "near", reason: "r", overlap: "o" }];

    generate.mockResolvedValue({ object: { candidates } });

    await expect(runKnownCardsJudge("p", "src")).resolves.toEqual({ candidates });
    expect(recorded).toEqual([{ outcome: "ok" }]);
  });
});
