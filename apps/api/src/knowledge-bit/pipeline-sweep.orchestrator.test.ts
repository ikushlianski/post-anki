import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  runPipelineSweep,
  SWEEP_MAX_SOURCES,
  SWEEP_MIN_AGE_MS,
  type PipelineSweepDeps,
} from "./pipeline-sweep.orchestrator.js";

function makeDeps(overrides: Partial<PipelineSweepDeps> = {}): PipelineSweepDeps {
  return {
    isDurable: vi.fn(() => true),
    reconcile: vi.fn(async () => []),
    listStalePending: vi.fn(async () => []),
    startExtraction: vi.fn(async (ids: string[]) => ({ started: ids, deferredIds: [] })),
    hasPendingBitWork: vi.fn(async () => false),
    sendKick: vi.fn(async () => undefined),
    kickInProcess: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("runPipelineSweep", () => {
  it("should do nothing and call Inngest zero times when nothing is pending", async () => {
    const deps = makeDeps();

    const result = await runPipelineSweep(deps);

    expect(result).toEqual({ requeued: 0, deferred: 0, kickSent: false });
    expect(deps.startExtraction).not.toHaveBeenCalled();
    expect(deps.sendKick).not.toHaveBeenCalled();
  });

  it("should requeue a source whose first send failed", async () => {
    const deps = makeDeps({ listStalePending: vi.fn(async () => ["s1", "s2"]) });

    const result = await runPipelineSweep(deps);

    expect(deps.listStalePending).toHaveBeenCalledWith(SWEEP_MIN_AGE_MS, SWEEP_MAX_SOURCES);
    expect(deps.startExtraction).toHaveBeenCalledWith(["s1", "s2"]);
    expect(result.requeued).toBe(2);
  });

  it("should report sources that Inngest still rejects as deferred", async () => {
    const deps = makeDeps({
      listStalePending: vi.fn(async () => ["s1"]),
      startExtraction: vi.fn(async () => ({ started: [], deferredIds: ["s1"] })),
    });

    expect(await runPipelineSweep(deps)).toMatchObject({ requeued: 0, deferred: 1 });
  });

  it("should not touch a source added a minute ago", async () => {
    const deps = makeDeps();

    await runPipelineSweep(deps);

    expect(SWEEP_MIN_AGE_MS).toBe(5 * 60 * 1000);
    expect(deps.startExtraction).not.toHaveBeenCalled();
  });

  it("should send one pipeline kick when bits still need embedding", async () => {
    const deps = makeDeps({ hasPendingBitWork: vi.fn(async () => true) });

    const result = await runPipelineSweep(deps);

    expect(result.kickSent).toBe(true);
    expect(deps.sendKick).toHaveBeenCalledTimes(1);
  });

  it("should still return the requeue result and skip the kick when the pending-work check fails", async () => {
    const deps = makeDeps({
      listStalePending: vi.fn(async () => ["s1"]),
      hasPendingBitWork: vi.fn(async () => {
        throw new Error("db down");
      }),
    });

    const result = await runPipelineSweep(deps);

    expect(result).toEqual({ requeued: 1, deferred: 0, kickSent: false });
    expect(deps.sendKick).not.toHaveBeenCalled();
  });

  it("should fail stale runs before requeueing", async () => {
    const order: string[] = [];
    const deps = makeDeps({
      reconcile: vi.fn(async () => {
        order.push("reconcile");

        return [];
      }),
      listStalePending: vi.fn(async () => {
        order.push("list");

        return ["s1"];
      }),
    });

    await runPipelineSweep(deps);

    expect(order).toEqual(["reconcile", "list"]);
  });

  it("should run the in-process kick and never touch Inngest when durable mode is off", async () => {
    const deps = makeDeps({ isDurable: vi.fn(() => false) });

    await runPipelineSweep(deps);

    expect(deps.kickInProcess).toHaveBeenCalledTimes(1);
    expect(deps.startExtraction).not.toHaveBeenCalled();
    expect(deps.sendKick).not.toHaveBeenCalled();
  });
});
