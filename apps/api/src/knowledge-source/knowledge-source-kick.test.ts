import { beforeEach, describe, expect, it, vi } from "vitest";

const startKick = vi.hoisted(() => vi.fn());
const startDurable = vi.hoisted(() => vi.fn());
const isDurable = vi.hoisted(() => vi.fn());

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../knowledge-bit/pipeline-kick.starter.js", () => ({ startKnowledgeBitPipelineKick: startKick }));
vi.mock("../knowledge-bit/durable-extraction.starter.js", () => ({
  isDurableExtractionEnabled: isDurable,
  startDurableExtraction: startDurable,
}));

const { kickSourcesAfterAdd } = await import("./knowledge-source-kick.js");

describe("kickSourcesAfterAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startKick.mockResolvedValue(undefined);
  });

  it("should finish handing the sources to durable extraction before returning", async () => {
    let handed = false;

    isDurable.mockReturnValue(true);
    startDurable.mockImplementation(async () => {
      await Promise.resolve();
      handed = true;

      return { started: ["s1:1"], deferredIds: [], unknownIds: [] };
    });

    await kickSourcesAfterAdd(["s1"]);

    expect(handed).toBe(true);
    expect(startKick).not.toHaveBeenCalled();
  });

  it("should never process a new source in the API process when durable is on and the send fails", async () => {
    isDurable.mockReturnValue(true);
    startDurable.mockResolvedValueOnce({ started: [], deferredIds: ["s1"], unknownIds: [] });
    startDurable.mockRejectedValueOnce(new Error("down"));

    await expect(kickSourcesAfterAdd(["s1"])).resolves.toBeUndefined();
    await expect(kickSourcesAfterAdd(["s1"])).resolves.toBeUndefined();

    expect(startKick).not.toHaveBeenCalled();
  });

  it("should still use the in-process kick when durable is off", async () => {
    isDurable.mockReturnValue(false);

    await kickSourcesAfterAdd(["s1"]);

    expect(startDurable).not.toHaveBeenCalled();
    expect(startKick).toHaveBeenCalledOnce();
  });
});
