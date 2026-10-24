import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../shared/inngest-client.js", () => ({ createInngestClient: () => ({ send: vi.fn() }) }));
vi.mock("./cards-claim.js", () => ({ claimCardsGeneration: vi.fn() }));
vi.mock("./cards-compile.orchestrator.js", () => ({ compileCards: vi.fn() }));
vi.mock("./cards-fanout.orchestrator.js", () => ({
  CARDS_FANOUT_CONCURRENCY: 3,
  startCardsForTopicsWithConcurrencyCap: vi.fn(),
}));

const { startCardsBackground, startCardsForTopics } = await import("./cards.starter.js");

function deps(isDurable: boolean, claimed: Record<string, boolean> = {}) {
  return {
    isDurable: () => isDurable,
    sendEvents: vi.fn().mockResolvedValue(undefined),
    runInProcess: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn(async (topicId: string) => claimed[topicId] ?? false),
    fanoutInProcess: vi.fn().mockResolvedValue(undefined),
  };
}

describe("startCardsBackground", () => {
  it("should compile in-process and send no event when the durable flag is off", async () => {
    const d = deps(false);

    await startCardsBackground("t1", d);

    expect(d.runInProcess).toHaveBeenCalledWith("t1");
    expect(d.sendEvents).not.toHaveBeenCalled();
  });

  it("should send one event and skip in-process work when the durable flag is on", async () => {
    const d = deps(true);

    await startCardsBackground("t1", d);

    expect(d.sendEvents).toHaveBeenCalledWith(["t1"]);
    expect(d.runInProcess).not.toHaveBeenCalled();
  });

  it("should fall back to in-process compile when the event cannot be sent so the claimed topic is not stranded", async () => {
    const d = deps(true);

    d.sendEvents.mockRejectedValue(new Error("inngest down"));

    await startCardsBackground("t1", d);

    expect(d.runInProcess).toHaveBeenCalledWith("t1");
  });
});

describe("startCardsForTopics", () => {
  it("should use the existing in-process fan-out and claim nothing itself when the flag is off", async () => {
    const d = deps(false);

    await startCardsForTopics(["a", "b"], d);

    expect(d.fanoutInProcess).toHaveBeenCalledWith(["a", "b"]);
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.sendEvents).not.toHaveBeenCalled();
  });

  it("should claim every topic then send a single batch when the flag is on", async () => {
    const d = deps(true);

    await startCardsForTopics(["a", "b", "c"], d);

    expect(d.claim).toHaveBeenCalledTimes(3);
    expect(d.sendEvents).toHaveBeenCalledTimes(1);
    expect(d.sendEvents).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("should not send topics that were already ready or generating", async () => {
    const d = deps(true, { b: true });

    await startCardsForTopics(["a", "b", "c"], d);

    expect(d.sendEvents).toHaveBeenCalledWith(["a", "c"]);
  });

  it("should send nothing when every topic is already claimed", async () => {
    const d = deps(true, { a: true });

    await startCardsForTopics(["a"], d);

    expect(d.sendEvents).not.toHaveBeenCalled();
  });

  it("should skip a topic whose claim fails and still send the others", async () => {
    const d = deps(true);

    d.claim.mockImplementation(async (topicId: string) => {
      if (topicId === "b") {
        throw new Error("lock failed");
      }

      return false;
    });

    await startCardsForTopics(["a", "b", "c"], d);

    expect(d.sendEvents).toHaveBeenCalledWith(["a", "c"]);
  });

  it("should compile the claimed topics in-process when the batch cannot be sent", async () => {
    const d = deps(true);

    d.sendEvents.mockRejectedValue(new Error("inngest down"));

    await startCardsForTopics(["a", "b"], d);

    expect(d.runInProcess.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "b"]);
  });
});
