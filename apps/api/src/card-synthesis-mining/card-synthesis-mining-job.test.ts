import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../shared/spend-guard.js", () => ({ assertLlmBudgetAvailable: vi.fn() }));
vi.mock("./card-synthesis-mining.orchestrator.js", () => ({ mineCluster: vi.fn() }));
vi.mock("./card-synthesis-mining.budget.js", () => ({ checkMiningGate: vi.fn() }));
vi.mock("./card-synthesis-mining-job.repo.js", () => ({ countSynthesizedSince: vi.fn() }));
vi.mock("./card-synthesis-mining-ledger.repo.js", () => ({ miningLedger: { sumUsage: vi.fn() } }));
vi.mock("./card-synthesis-mining-marking.js", () => ({ markUnclusteredExamined: vi.fn() }));
vi.mock("./card-synthesis-mining-selection.js", () => ({ selectMiningBatch: vi.fn() }));

import type { MineResult } from "./card-synthesis-mining.types.js";
import { runCardSynthesisMining, type MiningJobDeps } from "./card-synthesis-mining-job.js";

const vec = (x: number, y: number): number[] => [x, y, 0];

function bits(): { id: string; body: string; createdAt: Date; embedding: number[] }[] {
  const groups: [string, number[]][] = [
    ["a", vec(1, 0)],
    ["b", vec(0, 1)],
    ["c", vec(0, -1)],
    ["d", [0, 0, 1]],
  ];

  return groups.flatMap(([name, v]) =>
    [1, 2, 3].map((n) => ({ id: `${name}${n}`, body: "x", createdAt: new Date(), embedding: v })),
  ).concat([{ id: "lone", body: "x", createdAt: new Date(), embedding: vec(-1, 0) }]);
}

function result(outcome: MineResult["outcome"]): MineResult {
  return { outcome, clusterId: "c", sourceId: null, bitId: null };
}

function makeDeps(overrides: Partial<MiningJobDeps> = {}): MiningJobDeps {
  return {
    select: vi.fn().mockResolvedValue({ subjectId: "subj", bits: bits() }),
    countCreatedSince: vi.fn().mockResolvedValue(0),
    assertGlobalBudget: vi.fn().mockResolvedValue(undefined),
    checkGate: vi.fn().mockResolvedValue({ allowed: true, probe: false }),
    mine: vi.fn().mockResolvedValue(result("not_chain")),
    markUnclustered: vi.fn().mockResolvedValue(0),
    withLock: vi.fn(async (run) => ({ acquired: true as const, value: await run() })),
    costToday: vi.fn().mockResolvedValue(0.01),
    now: () => new Date("2026-11-21T08:00:00Z"),
    newRunId: () => "run1",
    ...overrides,
  };
}

describe("runCardSynthesisMining", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CARD_SYNTHESIS_MINING_ENABLED", "true");
    vi.stubEnv("CARD_SYNTHESIS_MINING_SUBJECT_IDS", "subj");
  });

  it("should do nothing and touch no data while the kill switch is off", async () => {
    vi.stubEnv("CARD_SYNTHESIS_MINING_ENABLED", "");
    const deps = makeDeps();

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("disabled");
    expect(deps.select).not.toHaveBeenCalled();
    expect(deps.mine).not.toHaveBeenCalled();
  });

  it("should report nothing_to_do when no subject is allow-listed", async () => {
    vi.stubEnv("CARD_SYNTHESIS_MINING_SUBJECT_IDS", "");
    const deps = makeDeps();

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("nothing_to_do");
    expect(deps.select).not.toHaveBeenCalled();
  });

  it("should report nothing_to_do when no subject has enough unexamined cards", async () => {
    const deps = makeDeps({ select: vi.fn().mockResolvedValue(null) });

    expect((await runCardSynthesisMining({}, deps)).status).toBe("nothing_to_do");
  });

  it("should stop after 3 new cards in a day and leave the remaining clusters unmarked", async () => {
    const mine = vi.fn().mockResolvedValue(result("synthesized"));
    const deps = makeDeps({ mine });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.created).toBe(3);
    expect(mine).toHaveBeenCalledTimes(3);
    expect(summary.status).toBe("capped");
    expect(summary.clusters).toBe(4);
    expect(summary.skipped).toBe(1);
  });

  it("should count cards already created earlier today toward the daily cap", async () => {
    const mine = vi.fn().mockResolvedValue(result("synthesized"));
    const deps = makeDeps({ mine, countCreatedSince: vi.fn().mockResolvedValue(2) });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.created).toBe(1);
    expect(mine).toHaveBeenCalledTimes(1);
  });

  it("should not call the model at all once today's cap is already used", async () => {
    const deps = makeDeps({ countCreatedSince: vi.fn().mockResolvedValue(3) });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("capped");
    expect(deps.mine).not.toHaveBeenCalled();
    expect(deps.checkGate).not.toHaveBeenCalled();
  });

  it("should write nothing and call no model on a dry run, even when disabled", async () => {
    vi.stubEnv("CARD_SYNTHESIS_MINING_ENABLED", "");
    const deps = makeDeps();

    const summary = await runCardSynthesisMining({ dryRun: true }, deps);

    expect(summary.status).toBe("dry_run");
    expect(summary).toMatchObject({ selected: 13, clusters: 4, created: 0 });
    expect(deps.mine).not.toHaveBeenCalled();
    expect(deps.markUnclustered).not.toHaveBeenCalled();
    expect(deps.checkGate).not.toHaveBeenCalled();
    expect(deps.assertGlobalBudget).not.toHaveBeenCalled();
  });

  it("should stop on a breaker denial and leave the remaining cards unmarked", async () => {
    const mine = vi
      .fn()
      .mockResolvedValueOnce(result("not_chain"))
      .mockResolvedValueOnce(result("skipped_breaker"));
    const deps = makeDeps({ mine });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("breaker_open");
    expect(mine).toHaveBeenCalledTimes(2);
    expect(summary.notChain).toBe(1);
    expect(summary.skipped).toBe(3);
  });

  it("should open the breaker after three consecutive failed clusters", async () => {
    const mine = vi.fn().mockResolvedValue(result("failed"));
    const deps = makeDeps({ mine });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("breaker_open");
    expect(mine).toHaveBeenCalledTimes(3);
    expect(summary.failed).toBe(3);
  });

  it("should treat retryable failures as breaker failures", async () => {
    const deps = makeDeps({ mine: vi.fn().mockResolvedValue(result("failed_retryable")) });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("breaker_open");
    expect(deps.mine).toHaveBeenCalledTimes(3);
  });

  it("should stop the whole run on a budget failure", async () => {
    const mine = vi.fn().mockResolvedValueOnce(result("not_chain")).mockResolvedValueOnce(result("failed_budget"));
    const deps = makeDeps({ mine });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("budget_exceeded");
    expect(mine).toHaveBeenCalledTimes(2);
  });

  it("should re-read today's created count before each cluster so cards made elsewhere stop the run", async () => {
    const countCreatedSince = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);
    const deps = makeDeps({ countCreatedSince });

    const summary = await runCardSynthesisMining({}, deps);

    expect(deps.mine).toHaveBeenCalledTimes(1);
    expect(summary.status).toBe("capped");
  });

  it("should return already_running and mine nothing when another run holds the lock", async () => {
    const deps = makeDeps({ withLock: vi.fn().mockResolvedValue({ acquired: false }) });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("already_running");
    expect(deps.select).not.toHaveBeenCalled();
    expect(deps.mine).not.toHaveBeenCalled();
  });

  it("should not take the lock on a dry run", async () => {
    const deps = makeDeps();

    await runCardSynthesisMining({ dryRun: true }, deps);

    expect(deps.withLock).not.toHaveBeenCalled();
  });

  it("should stop on a feature budget cap without mining", async () => {
    const deps = makeDeps({ checkGate: vi.fn().mockResolvedValue({ allowed: false, reason: "cap_daily" }) });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("capped");
    expect(deps.mine).not.toHaveBeenCalled();
  });

  it("should stop when the global LLM budget is exhausted", async () => {
    const deps = makeDeps({ assertGlobalBudget: vi.fn().mockRejectedValue(new Error("over")) });

    const summary = await runCardSynthesisMining({}, deps);

    expect(summary.status).toBe("budget_exceeded");
    expect(deps.mine).not.toHaveBeenCalled();
  });

  it("should mark lone cards as examined on a live run", async () => {
    const deps = makeDeps();

    await runCardSynthesisMining({}, deps);

    expect(deps.markUnclustered).toHaveBeenCalledWith("run1", ["lone"]);
  });

  it("should let limit lower the number of clusters mined", async () => {
    const deps = makeDeps();

    await runCardSynthesisMining({ limit: 2 }, deps);

    expect(deps.mine).toHaveBeenCalledTimes(2);
  });
});
