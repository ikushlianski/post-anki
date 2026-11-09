import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("./knowledge-bit.repo.js", () => ({
  getKnowledgeSourceClaimToken: vi.fn(),
  markSourceOwnedByDurable: vi.fn(),
  releaseDurableOwner: vi.fn(),
  failProcessingSourcesWithEndedWorkflows: vi.fn().mockResolvedValue([]),
}));

const mockSend = vi.fn().mockResolvedValue(undefined);

vi.mock("../shared/inngest-client.js", () => ({
  createInngestClient: () => ({ send: mockSend }),
}));

const { DEFAULT_DURABLE_TIMEOUT_MS, durableTimeoutMs, isDurableExtractionEnabled, startDurableExtraction, withTimeout, loadWorkflow, loadInngestWorkflow } = await import("./durable-extraction.starter.js");

type Workflow = import("./durable-extraction.starter.js").WorkflowAdapter;

function fakeWorkflow(overrides: Partial<Record<"launch" | "start", ReturnType<typeof vi.fn>>> = {}) {
  const launch = overrides.launch ?? vi.fn().mockResolvedValue(undefined);
  const start = overrides.start ?? vi.fn(async (input: { sourceId: string }, run: number) => `${input.sourceId}:${run}`);

  return {
    launch,
    start,
    workflow: {
      launchDurableExtraction: launch,
      startExtractionWorkflow: start,
      reconcileEndedWorkflows: vi.fn().mockResolvedValue([]),
    } as unknown as Workflow,
  };
}

describe("isDurableExtractionEnabled", () => {
  it("should stay off unless the flag is explicitly 1 or true", () => {
    expect(isDurableExtractionEnabled(undefined)).toBe(false);
    expect(isDurableExtractionEnabled("")).toBe(false);
    expect(isDurableExtractionEnabled("0")).toBe(false);
    expect(isDurableExtractionEnabled("false")).toBe(false);
    expect(isDurableExtractionEnabled("yes")).toBe(false);
    expect(isDurableExtractionEnabled("1")).toBe(true);
    expect(isDurableExtractionEnabled("true")).toBe(true);
  });
});

describe("startDurableExtraction", () => {
  it("should start one workflow per source with the id built from the source id and its run", async () => {
    const { workflow, start } = fakeWorkflow();

    const result = await startDurableExtraction(["ks_1", "ks_2"], { regeneration: false }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn(async (id: string) => ({ run: id === "ks_2" ? 3 : 1, claimedAt: new Date(0) })),
      workflowExists: vi.fn().mockResolvedValue(false), markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toMatchObject({ started: ["ks_1:1", "ks_2:3"], deferredIds: [] });
    expect(start).toHaveBeenCalledWith({ sourceId: "ks_1", regeneration: false }, 1);
    expect(start).toHaveBeenCalledWith({ sourceId: "ks_2", regeneration: false }, 3);
  });

  it("should pass the same workflow id for a duplicate start so the engine can treat it as a no-op", async () => {
    const { workflow } = fakeWorkflow();
    const deps = { loadWorkflow: async () => workflow, getClaim: vi.fn().mockResolvedValue({ run: 2, claimedAt: new Date(0) }), workflowExists: vi.fn().mockResolvedValue(false) , markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined)};

    const first = await startDurableExtraction(["ks_1"], { regeneration: true }, deps);
    const second = await startDurableExtraction(["ks_1"], { regeneration: true }, deps);

    expect(first.started).toEqual(second.started);
    expect(first.started).toEqual(["ks_1:2"]);
  });

  it("should send every source for the sweep when the engine fails to launch", async () => {
    const { workflow, start } = fakeWorkflow({ launch: vi.fn().mockRejectedValue(new Error("no database")) });

    const result = await startDurableExtraction(["ks_1", "ks_2"], { regeneration: false }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 1, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false), markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toMatchObject({ started: [], deferredIds: ["ks_1", "ks_2"] });
    expect(start).not.toHaveBeenCalled();
  });

  it("should send every source for the sweep when the engine module cannot load", async () => {
    const result = await startDurableExtraction(["ks_1"], { regeneration: false }, {
      loadWorkflow: async () => {
        throw new Error("module missing");
      },
      getClaim: vi.fn(),
      workflowExists: vi.fn().mockResolvedValue(false), markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.deferredIds).toEqual(["ks_1"]);
  });

  it("should send only the source whose start failed for the sweep", async () => {
    const start = vi.fn(async (input: { sourceId: string }, run: number) => {
      if (input.sourceId === "ks_2") {
        throw new Error("start failed");
      }

      return `${input.sourceId}:${run}`;
    });
    const { workflow } = fakeWorkflow({ start });

    const result = await startDurableExtraction(["ks_1", "ks_2"], { regeneration: false }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 1, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false), markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toMatchObject({ started: ["ks_1:1"], deferredIds: ["ks_2"] });
  });
});

describe("timeouts", () => {
  it("should send every source for the sweep when the engine launch never finishes", async () => {
    const { workflow, start } = fakeWorkflow({ launch: vi.fn(() => new Promise<void>(() => undefined)) });

    const result = await startDurableExtraction(["ks_1", "ks_2"], { regeneration: false, timeoutMs: 30 }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 1, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false), markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toMatchObject({ started: [], deferredIds: ["ks_1", "ks_2"] });
    expect(start).not.toHaveBeenCalled();
  });

  it("should send only the source whose workflow start never finishes for the sweep", async () => {
    const start = vi.fn((input: { sourceId: string }, run: number) =>
      input.sourceId === "ks_2" ? new Promise<string>(() => undefined) : Promise.resolve(`${input.sourceId}:${run}`),
    );
    const { workflow } = fakeWorkflow({ start });

    const result = await startDurableExtraction(["ks_1", "ks_2"], { regeneration: false, timeoutMs: 30 }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 1, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false), markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toMatchObject({ started: ["ks_1:1"], deferredIds: ["ks_2"] });
  });

  it("should reject a promise that outlives its limit and clear its timer when it finishes in time", async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, "slow")).rejects.toThrow("slow_timed_out_after_20ms");
    await expect(withTimeout(Promise.resolve("ok"), 1000, "fast")).resolves.toBe("ok");
  });

  it("should default to ten seconds and accept an override from the environment", () => {
    expect(DEFAULT_DURABLE_TIMEOUT_MS).toBe(10_000);
    expect(durableTimeoutMs(undefined)).toBe(10_000);
    expect(durableTimeoutMs("2500")).toBe(2500);
    expect(durableTimeoutMs("-5")).toBe(10_000);
    expect(durableTimeoutMs("abc")).toBe(10_000);
  });
});

describe("a start that times out", () => {
  it("should not fall back when the workflow was in fact created, so one run is never executed twice", async () => {
    const start = vi.fn(() => new Promise<string>(() => undefined));
    const { workflow } = fakeWorkflow({ start });
    const workflowExists = vi.fn().mockResolvedValue(true);

    const result = await startDurableExtraction(["ks_1"], { regeneration: true, timeoutMs: 30 }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 2, claimedAt: new Date(0) }),
      workflowExists,
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({ started: ["ks_1:2"], deferredIds: [], unknownIds: [] });
    expect(workflowExists).toHaveBeenCalledWith("ks_1:2");
  });

  it("should defer when the workflow does not exist and leave the source to the reconcile when the existence check itself fails", async () => {
    const start = vi.fn(() => new Promise<string>(() => undefined));
    const { workflow } = fakeWorkflow({ start });

    const result = await startDurableExtraction(["ks_1", "ks_2"], { regeneration: false, timeoutMs: 30 }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 1, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("no table")), markOwner: vi.fn().mockResolvedValue(true), releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.deferredIds).toEqual(["ks_1"]);
    expect(result.unknownIds).toEqual(["ks_2"]);
  });
});

describe("run lookup and owner marker", () => {
  it("should send the source to the sweep when the run number cannot be read, without guessing run 1", async () => {
    const { workflow, start } = fakeWorkflow();
    const workflowExists = vi.fn().mockResolvedValue(true);

    const result = await startDurableExtraction(["ks_1"], { regeneration: false }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockRejectedValue(new Error("db down")),
      workflowExists,
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({ started: [], deferredIds: ["ks_1"], unknownIds: [] });
    expect(start).not.toHaveBeenCalled();
    expect(workflowExists).not.toHaveBeenCalled();
  });

  it("should write the owner marker for the workflow id before starting a regeneration", async () => {
    const { workflow } = fakeWorkflow();
    const markOwner = vi.fn().mockResolvedValue(true);

    await startDurableExtraction(["ks_1"], { regeneration: true }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 4, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false),
      markOwner,
      releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(markOwner).toHaveBeenCalledWith("ks_1", "ks_1:4", expect.objectContaining({ run: 4 }));
  });

  it("should defer without starting when the regeneration owner marker cannot be written", async () => {
    const { workflow, start } = fakeWorkflow();

    const result = await startDurableExtraction(["ks_1"], { regeneration: true }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 4, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false),
      markOwner: vi.fn().mockResolvedValue(false),
      releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.deferredIds).toEqual(["ks_1"]);
    expect(start).not.toHaveBeenCalled();
  });

  it("should drop the owner marker before deferring the regeneration so a late start cannot run next to it", async () => {
    const { workflow } = fakeWorkflow({ start: vi.fn(() => new Promise<string>(() => undefined)) });
    const releaseOwner = vi.fn().mockResolvedValue(undefined);

    await startDurableExtraction(["ks_1"], { regeneration: true, timeoutMs: 30 }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 4, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false),
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner,
    });

    expect(releaseOwner).toHaveBeenCalledWith("ks_1", "ks_1:4");
  });
});

describe("a rejected send", () => {
  const rejectingWorkflow = () =>
    fakeWorkflow({ start: vi.fn().mockRejectedValue(new Error("inngest 500")) }).workflow;

  it("should leave a source pending for the sweep when Inngest rejects the send", async () => {
    const releaseOwner = vi.fn().mockResolvedValue(undefined);

    const result = await startDurableExtraction(["ks_1"], { regeneration: false }, {
      loadWorkflow: async () => rejectingWorkflow(),
      getClaim: vi.fn().mockResolvedValue({ run: 1, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false),
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner,
    });

    expect(result).toEqual({ started: [], deferredIds: ["ks_1"], unknownIds: [] });
    expect(releaseOwner).not.toHaveBeenCalled();
  });

  it("should release a regeneration's owner mark and defer it when the send fails", async () => {
    const releaseOwner = vi.fn().mockResolvedValue(undefined);

    const result = await startDurableExtraction(["ks_1"], { regeneration: true }, {
      loadWorkflow: async () => rejectingWorkflow(),
      getClaim: vi.fn().mockResolvedValue({ run: 3, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false),
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner,
    });

    expect(releaseOwner).toHaveBeenCalledWith("ks_1", "ks_1:3");
    expect(result.deferredIds).toEqual(["ks_1"]);
  });

  it("should not report a source as deferred when the resend with the same id succeeds", async () => {
    const result = await startDurableExtraction(["ks_1"], { regeneration: false }, {
      loadWorkflow: async () => rejectingWorkflow(),
      getClaim: vi.fn().mockResolvedValue({ run: 1, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(true),
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({ started: ["ks_1:1"], deferredIds: [], unknownIds: [] });
  });
});

describe("unknown start outcomes", () => {
  it("should not fall back when the owner marker cannot be released, so the old pipeline never runs next to a possible workflow", async () => {
    const { workflow } = fakeWorkflow({ start: vi.fn(() => new Promise<string>(() => undefined)) });

    const result = await startDurableExtraction(["ks_1"], { regeneration: true, timeoutMs: 30 }, {
      loadWorkflow: async () => workflow,
      getClaim: vi.fn().mockResolvedValue({ run: 4, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false),
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner: vi.fn().mockRejectedValue(new Error("db down")),
    });

    expect(result).toEqual({ started: [], deferredIds: [], unknownIds: ["ks_1"] });
  });
});

describe("extraction event extras", () => {
  it("should pass forceAtLeastOne and modelId in the event", async () => {
    mockSend.mockClear();

    const result = await startDurableExtraction(["ks_1"], {
      regeneration: true,
      extras: { forceAtLeastOne: true, modelId: "openrouter/m" },
    }, {
      loadWorkflow: async () => loadInngestWorkflow(),
      getClaim: vi.fn().mockResolvedValue({ run: 2, claimedAt: new Date(0) }),
      workflowExists: vi.fn().mockResolvedValue(false),
      markOwner: vi.fn().mockResolvedValue(true),
      releaseOwner: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.started).toEqual(["ks_1:2"]);
    expect(mockSend).toHaveBeenCalledWith({
      name: "knowledge-source/extraction.requested",
      id: "ks_1:2",
      data: { sourceId: "ks_1", run: 2, regeneration: true, forceAtLeastOne: true, modelId: "openrouter/m" },
    });
  });
});

describe("inngest engine", () => {
  it("should use Inngest as the only engine", async () => {
    const adapter = await loadWorkflow();

    expect(adapter).toBe(await loadWorkflow());
    expect(typeof adapter.startExtractionWorkflow).toBe("function");
    expect(typeof adapter.reconcileEndedWorkflows).toBe("function");
  });

  it("should call inngest.send with the right event name and id when starting a workflow", async () => {
    mockSend.mockClear();

    const adapter = loadInngestWorkflow();
    const workflowId = await adapter.startExtractionWorkflow({ sourceId: "ks_abc", regeneration: false }, 7);

    expect(workflowId).toBe("ks_abc:7");
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "knowledge-source/extraction.requested",
        id: "ks_abc:7",
        data: expect.objectContaining({ sourceId: "ks_abc", run: 7, regeneration: false }),
      }),
    );
  });

  it("should pass the regeneration flag through to the event data", async () => {
    mockSend.mockClear();

    const adapter = loadInngestWorkflow();

    await adapter.startExtractionWorkflow({ sourceId: "ks_regen", regeneration: true }, 3);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ regeneration: true }) }),
    );
  });

  it("should be a no-op for launchDurableExtraction", async () => {
    const adapter = loadInngestWorkflow();

    await expect(adapter.launchDurableExtraction()).resolves.toBeUndefined();
  });
});
