import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/client.js";
import { runCardRewordingScan } from "./card-rewording.orchestrator.js";

const { listMock, draftsMock, insertMock, agentMock, failureMock } = vi.hoisted(() => ({
  failureMock: vi.fn(),
  listMock: vi.fn(),
  draftsMock: vi.fn(),
  insertMock: vi.fn(),
  agentMock: vi.fn(),
}));

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../knowledge-bit/knowledge-bit-card-difficulty.repo.js", () => ({ listDifficultPlainCards: listMock }));
vi.mock("./card-rewording.repo.js", () => ({
  bitIdsWithAnyDraft: draftsMock,
  insertRewordedDrafts: insertMock,
  recordRewordingFailure: failureMock,
}));
vi.mock("../mastra/card-rewording.agent.js", () => ({ runCardRewording: agentMock }));

const db = {} as Db;

function cards(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    bitId: `kb_${i}`,
    front: `Front ${i}?`,
    back: `Back answer ${i}`,
    subjectId: "sub_1",
  }));
}

const fourVersions = {
  versions: [
    { angle: "cause", prompt: "Reworded one?" },
    { angle: "situation", prompt: "Reworded two?" },
    { angle: "gap", prompt: "Reworded three?" },
    { angle: "reason", prompt: "Reworded four?" },
  ],
};

describe("runCardRewordingScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draftsMock.mockResolvedValue(new Set());
    insertMock.mockImplementation(async (_db, rows: unknown[]) => rows.length);
    agentMock.mockResolvedValue(fourVersions);
  });

  it("should reword at most 10 difficult cards per run to bound spend", async () => {
    listMock.mockResolvedValue(cards(15));

    const result = await runCardRewordingScan(db);

    expect(agentMock).toHaveBeenCalledTimes(10);
    expect(result.considered).toBe(10);
  });

  it("should never regenerate cards that already have a draft, including rejected ones", async () => {
    listMock.mockResolvedValue(cards(3));
    draftsMock.mockResolvedValue(new Set(["kb_0", "kb_2"]));

    const result = await runCardRewordingScan(db);

    expect(agentMock).toHaveBeenCalledTimes(1);
    expect(agentMock.mock.calls[0]?.[1]).toBe("kb_1");
    expect(result.skippedWithDrafts).toBe(2);
  });

  it("should store at most 3 drafts per card with the original answer", async () => {
    listMock.mockResolvedValue(cards(1));

    const result = await runCardRewordingScan(db);

    const rows = insertMock.mock.calls[0]?.[1] as { answer: string; knowledgeBitId: string }[];

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.answer === "Back answer 0" && row.knowledgeBitId === "kb_0")).toBe(true);
    expect(result.versionsStored).toBe(3);
  });

  it("should keep scanning when one card fails", async () => {
    listMock.mockResolvedValue(cards(2));
    agentMock.mockRejectedValueOnce(new Error("boom"));

    const result = await runCardRewordingScan(db);

    expect(result).toMatchObject({ failed: 1, reworded: 1 });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("should remember a failed card so later runs do not pay to retry it", async () => {
    listMock.mockResolvedValue(cards(2));
    agentMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({
      versions: [{ angle: "cause", prompt: "Front 1?" }],
    });

    await runCardRewordingScan(db);

    expect(failureMock).toHaveBeenCalledTimes(2);
    expect(failureMock).toHaveBeenCalledWith(db, "kb_0", expect.any(String));
    expect(failureMock).toHaveBeenCalledWith(db, "kb_1", expect.any(String));
  });

  it("should write nothing on a dry run", async () => {
    listMock.mockResolvedValue(cards(1));

    const result = await runCardRewordingScan(db, { dryRun: true });

    expect(insertMock).not.toHaveBeenCalled();
    expect(failureMock).not.toHaveBeenCalled();
    expect(result.versionsStored).toBe(3);
  });

  it("should honour a smaller limit", async () => {
    listMock.mockResolvedValue(cards(5));

    await runCardRewordingScan(db, { limit: 2 });

    expect(agentMock).toHaveBeenCalledTimes(2);
  });
});
