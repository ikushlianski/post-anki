import { describe, expect, it, vi } from "vitest";
import {
  sweepIdleTriageSessions,
  TRIAGE_IDLE_AFTER_MS,
  type IdleSweepDeps,
} from "./card-triage-idle-sweep.orchestrator.js";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("./card-triage-distill.orchestrator.js", () => ({ distillTriageSession: vi.fn() }));
vi.mock("./card-triage-session.repo.js", () => ({
  finishTriageSession: vi.fn(),
  listIdleOpenTriageSessionIds: vi.fn(),
}));

const NOW = new Date("2026-11-10T12:00:00.000Z");

function makeDeps(ids: string[]): IdleSweepDeps {
  return {
    listIdle: vi.fn().mockResolvedValue(ids),
    finish: vi.fn().mockResolvedValue(undefined),
    distill: vi.fn().mockResolvedValue(undefined),
  };
}

describe("sweepIdleTriageSessions", () => {
  it("should close and distil a session left open for more than a day so its notes reach new cards", async () => {
    const deps = makeDeps(["cts_old"]);
    const result = await sweepIdleTriageSessions(NOW, deps);

    expect(deps.listIdle).toHaveBeenCalledWith(new Date(NOW.getTime() - TRIAGE_IDLE_AFTER_MS), 20);
    expect(deps.finish).toHaveBeenCalledWith("cts_old");
    expect(deps.distill).toHaveBeenCalledWith("cts_old");
    expect(result).toEqual({ closed: 1, failed: 0 });
  });

  it("should leave a recent session alone when nothing is idle", async () => {
    const deps = makeDeps([]);
    const result = await sweepIdleTriageSessions(NOW, deps);

    expect(deps.finish).not.toHaveBeenCalled();
    expect(deps.distill).not.toHaveBeenCalled();
    expect(result).toEqual({ closed: 0, failed: 0 });
  });

  it("should keep going when one session fails to close", async () => {
    const deps = makeDeps(["cts_bad", "cts_ok"]);

    vi.mocked(deps.finish).mockRejectedValueOnce(new Error("boom"));

    const result = await sweepIdleTriageSessions(NOW, deps);

    expect(deps.distill).toHaveBeenCalledTimes(1);
    expect(deps.distill).toHaveBeenCalledWith("cts_ok");
    expect(result).toEqual({ closed: 1, failed: 1 });
  });
});
