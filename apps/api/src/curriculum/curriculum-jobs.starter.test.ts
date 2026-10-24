import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../shared/inngest-client.js", () => ({ createInngestClient: () => ({ send: vi.fn() }) }));
vi.mock("./curriculum-parse.orchestrator.js", () => ({
  researchCurriculum: vi.fn(),
  retryResearch: vi.fn(),
}));
vi.mock("./curriculum-research-jobs.repo.js", () => ({
  touchResearchJob: vi.fn(),
  clearResearchJobTouch: vi.fn(),
}));
vi.mock("./curriculum.repo.js", () => ({
  deleteAllCurriculumSources: vi.fn(),
  insertResearchSource: vi.fn(),
  setCurriculumStatus: vi.fn(),
}));

const { startResearch, startRetryResearch } = await import("./curriculum-jobs.starter.js");

function deps(isDurable: boolean) {
  const calls: string[] = [];
  const d = {
    isDurable: () => isDurable,
    writeMarker: vi.fn(async () => void calls.push("marker")),
    removeMarker: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn(async () => void calls.push("claim")),
    release: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    sendEvent: vi.fn(async () => void calls.push("send")),
    researchInProcess: vi.fn().mockResolvedValue(undefined),
    retryInProcess: vi.fn().mockResolvedValue(undefined),
  };

  return { d, calls };
}

const INPUT = { name: "Vite", docUrl: "https://vite.dev" };

describe("startResearch", () => {
  it("should research in-process and touch nothing else when the flag is off", async () => {
    const { d } = deps(false);

    await startResearch("cur_1", INPUT, d);

    expect(d.researchInProcess).toHaveBeenCalledWith("cur_1", INPUT);
    expect(d.writeMarker).not.toHaveBeenCalled();
    expect(d.sendEvent).not.toHaveBeenCalled();
  });

  it("should write the marker and claim before sending, so the job can read the doc URL back", async () => {
    const { d, calls } = deps(true);

    await startResearch("cur_1", INPUT, d);

    expect(calls).toEqual(["marker", "claim", "send"]);
    expect(d.sendEvent).toHaveBeenCalledWith("cur_1", false);
    expect(d.researchInProcess).not.toHaveBeenCalled();
  });

  it("should remove the marker, release and research in-process when the send fails", async () => {
    const { d } = deps(true);

    d.sendEvent.mockRejectedValue(new Error("inngest down"));

    await startResearch("cur_1", INPUT, d);

    expect(d.removeMarker).toHaveBeenCalledWith("cur_1");
    expect(d.release).toHaveBeenCalledWith("cur_1");
    expect(d.researchInProcess).toHaveBeenCalledWith("cur_1", INPUT);
  });

  it("should mark the curriculum failed and surface the error when the claim fails", async () => {
    const { d } = deps(true);

    d.claim.mockRejectedValue(new Error("db down"));

    await expect(startResearch("cur_1", INPUT, d)).rejects.toThrow("db down");
    expect(d.markFailed).toHaveBeenCalledWith("cur_1");
    expect(d.sendEvent).not.toHaveBeenCalled();
  });
});

describe("fallback cleanup guard", () => {
  it("should end the course failed when removing the marker throws after a failed send", async () => {
    const { d } = deps(true);

    d.sendEvent.mockRejectedValue(new Error("inngest down"));
    d.removeMarker.mockRejectedValue(new Error("db down"));

    await startResearch("cur_1", INPUT, d);

    expect(d.markFailed).toHaveBeenCalledWith("cur_1");
    expect(d.researchInProcess).not.toHaveBeenCalled();
  });

  it("should end the course failed when release throws after a failed retry send", async () => {
    const { d } = deps(true);

    d.sendEvent.mockRejectedValue(new Error("inngest down"));
    d.release.mockRejectedValue(new Error("db down"));

    await startRetryResearch("cur_1", d);

    expect(d.markFailed).toHaveBeenCalledWith("cur_1");
    expect(d.retryInProcess).not.toHaveBeenCalled();
  });
});

describe("startRetryResearch", () => {
  it("should retry in-process when the flag is off", async () => {
    const { d } = deps(false);

    await startRetryResearch("cur_1", d);

    expect(d.retryInProcess).toHaveBeenCalledWith("cur_1");
    expect(d.sendEvent).not.toHaveBeenCalled();
  });

  it("should claim before sending a retry event", async () => {
    const { d, calls } = deps(true);

    await startRetryResearch("cur_1", d);

    expect(calls).toEqual(["claim", "send"]);
    expect(d.sendEvent).toHaveBeenCalledWith("cur_1", true);
  });

  it("should release and retry in-process when the send fails", async () => {
    const { d } = deps(true);

    d.sendEvent.mockRejectedValue(new Error("inngest down"));

    await startRetryResearch("cur_1", d);

    expect(d.release).toHaveBeenCalledWith("cur_1");
    expect(d.retryInProcess).toHaveBeenCalledWith("cur_1");
  });
});
