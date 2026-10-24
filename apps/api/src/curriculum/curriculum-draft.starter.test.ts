import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../shared/inngest-client.js", () => ({ createInngestClient: () => ({ send: vi.fn() }) }));
vi.mock("./curriculum-parse.orchestrator.js", () => ({ generateCurriculumFromApprovedSources: vi.fn() }));
vi.mock("./curriculum-structure.js", () => ({ generateDraftStructure: vi.fn(), retryDraftStructure: vi.fn() }));
vi.mock("./curriculum-draft-jobs.repo.js", () => ({ claimDraftJob: vi.fn() }));
vi.mock("./curriculum-research-jobs.repo.js", () => ({ clearResearchJobTouch: vi.fn() }));
vi.mock("./curriculum.repo.js", () => ({
  insertApprovedTextSource: vi.fn(),
  setCurriculumStatus: vi.fn(),
}));

const { startDraftFromApprovedSources, startRetryDraft, insertPastedMaterialEarly, startPastedDraft } =
  await import("./curriculum-draft.starter.js");

function deps(isDurable: boolean) {
  const calls: string[] = [];
  const d = {
    isDurable: () => isDurable,
    insertPastedText: vi.fn(async () => void calls.push("insert")),
    claim: vi.fn(async () => {
      calls.push("claim");

      return { liveRunActive: false };
    }),
    release: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    sendEvent: vi.fn(async () => void calls.push("send")),
    approvedInProcess: vi.fn().mockResolvedValue(undefined),
    retryInProcess: vi.fn().mockResolvedValue(undefined),
    pastedInProcess: vi.fn(async () => void calls.push("pasted")),
  };

  return { d, calls };
}

describe("startDraftFromApprovedSources", () => {
  it("should run the old path and send nothing when the flag is off", async () => {
    const { d } = deps(false);

    await startDraftFromApprovedSources("cur_1", d);

    expect(d.approvedInProcess).toHaveBeenCalledWith("cur_1");
    expect(d.sendEvent).not.toHaveBeenCalled();
  });

  it("should claim then send an approve event when the flag is on", async () => {
    const { d, calls } = deps(true);

    await startDraftFromApprovedSources("cur_1", d);

    expect(calls).toEqual(["claim", "send"]);
    expect(d.sendEvent).toHaveBeenCalledWith("cur_1", true, false);
  });

  it("should fall back in-process when the send fails", async () => {
    const { d } = deps(true);

    d.sendEvent.mockRejectedValue(new Error("down"));

    await startDraftFromApprovedSources("cur_1", d);

    expect(d.release).toHaveBeenCalledWith("cur_1");
    expect(d.approvedInProcess).toHaveBeenCalledWith("cur_1");
  });

  it("should end the course failed, not stuck, when the fallback cleanup throws", async () => {
    const { d } = deps(true);

    d.sendEvent.mockRejectedValue(new Error("down"));
    d.release.mockRejectedValue(new Error("db down"));

    await startDraftFromApprovedSources("cur_1", d);

    expect(d.markFailed).toHaveBeenCalledWith("cur_1");
    expect(d.approvedInProcess).not.toHaveBeenCalled();
  });

  it("should mark failed and surface the error when the claim fails", async () => {
    const { d } = deps(true);

    d.claim.mockRejectedValue(new Error("db down"));

    await expect(startDraftFromApprovedSources("cur_1", d)).rejects.toThrow("db down");
    expect(d.markFailed).toHaveBeenCalledWith("cur_1");
    expect(d.sendEvent).not.toHaveBeenCalled();
  });
});

describe("startRetryDraft", () => {
  it("should retry in-process when the flag is off", async () => {
    const { d } = deps(false);

    await startRetryDraft("cur_1", d);

    expect(d.retryInProcess).toHaveBeenCalledWith("cur_1");
  });

  it("should send a retry event when the flag is on", async () => {
    const { d } = deps(true);

    await startRetryDraft("cur_1", d);

    expect(d.sendEvent).toHaveBeenCalledWith("cur_1", false, true);
  });

  it("should not start a second paid draft or untouch the course when the send fails while a run is live", async () => {
    const { d } = deps(true);

    d.claim.mockResolvedValue({ liveRunActive: true });
    d.sendEvent.mockRejectedValue(new Error("down"));

    await startRetryDraft("cur_1", d);

    expect(d.retryInProcess).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  it("should end the course failed when the fallback cleanup throws", async () => {
    const { d } = deps(true);

    d.sendEvent.mockRejectedValue(new Error("down"));
    d.release.mockRejectedValue(new Error("db down"));

    await startRetryDraft("cur_1", d);

    expect(d.markFailed).toHaveBeenCalledWith("cur_1");
    expect(d.retryInProcess).not.toHaveBeenCalled();
  });
});

describe("pasted material", () => {
  it("should not insert early when the flag is off", async () => {
    const { d } = deps(false);

    expect(await insertPastedMaterialEarly("cur_1", "text", d)).toBe(false);
    expect(d.insertPastedText).not.toHaveBeenCalled();
  });

  it("should insert before the response and send a draft event with no text when the flag is on", async () => {
    const { d, calls } = deps(true);

    const early = await insertPastedMaterialEarly("cur_1", "text", d);

    await startPastedDraft("cur_1", "text", early, d);

    expect(calls).toEqual(["insert", "claim", "send"]);
    expect(d.sendEvent).toHaveBeenCalledWith("cur_1", false, false);
    expect(d.pastedInProcess).not.toHaveBeenCalled();
  });

  it("should keep the old insert-then-draft order in-process when the flag is off", async () => {
    const { d, calls } = deps(false);

    await startPastedDraft("cur_1", "text", false, d);

    expect(calls).toEqual(["insert", "pasted"]);
  });

  it("should fall back to the in-process path when the early insert fails", async () => {
    const { d, calls } = deps(true);

    d.insertPastedText.mockRejectedValueOnce(new Error("db down"));

    const early = await insertPastedMaterialEarly("cur_1", "text", d);

    await startPastedDraft("cur_1", "text", early, d);

    expect(early).toBe(false);
    expect(calls).toEqual(["insert", "pasted"]);
    expect(d.sendEvent).not.toHaveBeenCalled();
  });
});
