import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../shared/inngest-client.js", () => ({ createInngestClient: () => ({ send: vi.fn() }) }));
vi.mock("./knowledge-bit-pipeline-kick.orchestrator.js", () => ({
  kickKnowledgeBitPipeline: vi.fn(),
}));

const { startKnowledgeBitPipelineKick } = await import("./pipeline-kick.starter.js");

function deps(isDurable: boolean) {
  return {
    isDurable: () => isDurable,
    sendEvent: vi.fn().mockResolvedValue(undefined),
    kickInProcess: vi.fn().mockResolvedValue(undefined),
  };
}

describe("startKnowledgeBitPipelineKick", () => {
  it("should run the in-process kick and send no event when the durable flag is off", async () => {
    const d = deps(false);

    await startKnowledgeBitPipelineKick(d);

    expect(d.kickInProcess).toHaveBeenCalledTimes(1);
    expect(d.sendEvent).not.toHaveBeenCalled();
  });

  it("should send one event and skip the in-process kick when the durable flag is on", async () => {
    const d = deps(true);

    await startKnowledgeBitPipelineKick(d);

    expect(d.sendEvent).toHaveBeenCalledTimes(1);
    expect(d.kickInProcess).not.toHaveBeenCalled();
  });

  it("should swallow a failed send without running the passes in the API process", async () => {
    const d = deps(true);

    d.sendEvent.mockRejectedValue(new Error("inngest down"));

    await expect(startKnowledgeBitPipelineKick(d)).resolves.toBeUndefined();

    expect(d.kickInProcess).not.toHaveBeenCalled();
  });

  it("should surface an in-process kick failure to the caller", async () => {
    const d = deps(false);

    d.kickInProcess.mockRejectedValue(new Error("boom"));

    await expect(startKnowledgeBitPipelineKick(d)).rejects.toThrow("boom");
  });
});
