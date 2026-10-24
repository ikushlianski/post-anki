import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("./curriculum-parse.orchestrator.js", () => ({
  parseCurriculum: vi.fn(),
  reparseCurriculum: vi.fn(),
}));
vi.mock("./curriculum-merge.orchestrator.js", () => ({
  mergeSourcesIntoCurriculum: vi.fn(),
  mergeSynthesize: vi.fn(),
}));

const { startParse, startReparse, startMerge } = await import("./curriculum-parse.starter.js");
type Deps = import("./curriculum-parse.starter.js").ParseStarterDeps;

function makeDeps(durable: boolean): Deps {
  return {
    isDurable: () => durable,
    addSources: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    sendEvent: vi.fn().mockResolvedValue(undefined),
    parseInProcess: vi.fn().mockResolvedValue(undefined),
    reparseInProcess: vi.fn().mockResolvedValue(undefined),
    mergeInProcess: vi.fn().mockResolvedValue(undefined),
    mergeSynthesizeInProcess: vi.fn().mockResolvedValue(undefined),
  };
}

describe("curriculum parse starter", () => {
  it("should run in-process and send nothing when the durable flag is off", async () => {
    const deps = makeDeps(false);

    await startParse("c1", deps);
    await startReparse("c1", deps);
    await startMerge("c1", [], deps);

    expect(deps.parseInProcess).toHaveBeenCalledWith("c1");
    expect(deps.reparseInProcess).toHaveBeenCalledWith("c1");
    expect(deps.mergeInProcess).toHaveBeenCalledWith("c1", []);
    expect(deps.sendEvent).not.toHaveBeenCalled();
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it("should claim then send the matching mode when the flag is on", async () => {
    const deps = makeDeps(true);

    await startReparse("c1", deps);

    expect(deps.claim).toHaveBeenCalledWith("c1");
    expect(deps.sendEvent).toHaveBeenCalledWith("c1", "reparse");
    expect(deps.reparseInProcess).not.toHaveBeenCalled();
  });

  it("should save the new sources before sending a merge", async () => {
    const deps = makeDeps(true);

    await startMerge("c1", [], deps);

    expect(deps.addSources).toHaveBeenCalledWith("c1", []);
    expect(deps.sendEvent).toHaveBeenCalledWith("c1", "merge");
  });

  it("should release the claim and run in-process when the send fails", async () => {
    const deps = makeDeps(true);

    vi.mocked(deps.sendEvent).mockRejectedValue(new Error("down"));
    await startParse("c1", deps);

    expect(deps.release).toHaveBeenCalledWith("c1");
    expect(deps.parseInProcess).toHaveBeenCalledWith("c1");
  });

  it("should mark the course failed and skip the fallback when the cleanup throws", async () => {
    const deps = makeDeps(true);

    vi.mocked(deps.sendEvent).mockRejectedValue(new Error("down"));
    vi.mocked(deps.release).mockRejectedValue(new Error("db"));
    await startParse("c1", deps);

    expect(deps.markFailed).toHaveBeenCalledWith("c1");
    expect(deps.parseInProcess).not.toHaveBeenCalled();
  });

  it("should mark the course failed and rethrow when the claim fails", async () => {
    const deps = makeDeps(true);

    vi.mocked(deps.claim).mockRejectedValue(new Error("db"));

    await expect(startParse("c1", deps)).rejects.toThrow("db");
    expect(deps.markFailed).toHaveBeenCalledWith("c1");
    expect(deps.sendEvent).not.toHaveBeenCalled();
  });
});
