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

      return { started: ["s1:1"], fallbackIds: [], unknownIds: [] };
    });

    await kickSourcesAfterAdd(["s1"]);

    expect(handed).toBe(true);
    expect(startKick).not.toHaveBeenCalled();
  });

  it("should fall back to the pipeline kick when durable extraction could not start a source", async () => {
    isDurable.mockReturnValue(true);
    startDurable.mockResolvedValue({ started: [], fallbackIds: ["s1"], unknownIds: [] });

    await kickSourcesAfterAdd(["s1"]);

    expect(startKick).toHaveBeenCalledOnce();
  });

  it("should fall back to the pipeline kick when durable extraction throws", async () => {
    isDurable.mockReturnValue(true);
    startDurable.mockRejectedValue(new Error("down"));

    await kickSourcesAfterAdd(["s1"]);

    expect(startKick).toHaveBeenCalledOnce();
  });

  it("should not fail the upload when the pipeline kick fails", async () => {
    isDurable.mockReturnValue(true);
    startDurable.mockRejectedValue(new Error("down"));
    startKick.mockRejectedValue(new Error("kick down"));

    await expect(kickSourcesAfterAdd(["s1"])).resolves.toBeUndefined();
  });

  it("should only run the pipeline kick when durable extraction is off", async () => {
    isDurable.mockReturnValue(false);

    await kickSourcesAfterAdd(["s1"]);

    expect(startDurable).not.toHaveBeenCalled();
    expect(startKick).toHaveBeenCalledOnce();
  });
});
