import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { log } from "../shared/log.js";
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
    startExtraction: vi.fn(async (ids: string[]) => ({
      started: ids.map((id) => `${id}:1`),
      deferredIds: [],
    })),
    touchPending: vi.fn(async () => undefined),
    summarizeStuckPending: vi.fn(async () => ({ count: 0, oldestAgeMs: 0 })),
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

  it("should move requeued sources to the back of the queue so they get a fresh event id", async () => {
    const deps = makeDeps({
      listStalePending: vi.fn(async () => ["s1", "s2", "s3"]),
      startExtraction: vi.fn(async () => ({ started: ["s1:1", "s3:1"], deferredIds: ["s2"] })),
    });

    await runPipelineSweep(deps);

    expect(deps.touchPending).toHaveBeenCalledWith(["s1", "s3"]);
  });

  it("should leave deferred sources untouched so they are retried on the next tick", async () => {
    const deps = makeDeps({
      listStalePending: vi.fn(async () => ["s1"]),
      startExtraction: vi.fn(async () => ({ started: [], deferredIds: ["s1"] })),
    });

    await runPipelineSweep(deps);

    expect(deps.touchPending).not.toHaveBeenCalled();
  });

  it("should hand different sources to Inngest on two consecutive ticks when more than 20 are pending", async () => {
    let queue = Array.from({ length: 45 }, (_, i) => `s${i}`);
    const sent: string[][] = [];
    const deps = makeDeps({
      listStalePending: vi.fn(async (_age: number, limit: number) => queue.slice(0, limit)),
      startExtraction: vi.fn(async (ids: string[]) => {
        sent.push(ids);

        return { started: ids.map((id) => `${id}:1`), deferredIds: [] };
      }),
      touchPending: vi.fn(async (ids: string[]) => {
        queue = [...queue.filter((id) => !ids.includes(id)), ...ids];
      }),
    });

    await runPipelineSweep(deps);
    await runPipelineSweep(deps);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toHaveLength(20);
    expect((sent[1] ?? []).filter((id) => (sent[0] ?? []).includes(id))).toEqual([]);
  });

  it("should log one pending_sources_stuck error when sources have been pending over 30 minutes", async () => {
    vi.mocked(log.error).mockClear();
    const deps = makeDeps({
      summarizeStuckPending: vi.fn(async () => ({ count: 7, oldestAgeMs: 90_000 })),
    });

    await runPipelineSweep(deps);

    expect(deps.summarizeStuckPending).toHaveBeenCalledWith(30 * 60 * 1000);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      { count: 7, oldestAgeMs: 90_000 },
      "pending_sources_stuck",
    );
  });

  it("should not log a stuck error when nothing is overdue", async () => {
    vi.mocked(log.error).mockClear();

    await runPipelineSweep(makeDeps());

    expect(log.error).not.toHaveBeenCalled();
  });

  it("should still finish the sweep when the stuck-source count fails", async () => {
    const deps = makeDeps({
      listStalePending: vi.fn(async () => ["s1"]),
      summarizeStuckPending: vi.fn(async () => {
        throw new Error("db down");
      }),
    });

    await expect(runPipelineSweep(deps)).resolves.toMatchObject({ requeued: 1 });
  });

  it("should still send the pending-work kick when bumping the handed-off sources fails", async () => {
    const deps = makeDeps({
      listStalePending: vi.fn(async () => ["s1"]),
      touchPending: vi.fn(async () => {
        throw new Error("db down");
      }),
      hasPendingBitWork: vi.fn(async () => true),
    });

    const result = await runPipelineSweep(deps);

    expect(result).toMatchObject({ requeued: 1, kickSent: true });
    expect(deps.sendKick).toHaveBeenCalledTimes(1);
  });
});
