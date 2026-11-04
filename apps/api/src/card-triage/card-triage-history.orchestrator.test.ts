import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TriageHistoryRow } from "./card-triage-history.repo.js";

const repo = vi.hoisted(() => ({ listRecentTriageDecisions: vi.fn() }));
const embeddings = vi.hoisted(() => ({ embedTexts: vi.fn() }));
const subjectType = vi.hoisted(() => ({
  loadSubjectKindRows: vi.fn(async () => []),
  pickRejectSubjectType: vi.fn(() => "other" as const),
}));

vi.mock("./card-triage-history.repo.js", () => repo);
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn() } }));
vi.mock("../shared/embeddings-client.js", () => embeddings);
vi.mock("../subject/reject-subject-type.js", () => subjectType);

const { getRecentTriageHistory } = await import("./card-triage-history.orchestrator.js");

function row(id: string, overrides: Partial<TriageHistoryRow> = {}): TriageHistoryRow {
  return {
    id,
    sessionId: "cts_1",
    bitId: `kb_${id}`,
    verdict: "rejected",
    reasonCode: null,
    note: null,
    decidedAt: new Date("2026-11-01T10:00:00Z"),
    front: `front ${id}`,
    back: "back",
    subjectId: null,
    extractionModelId: "model-x",
    fusionModelIds: ["m1"],
    bitBody: null,
    bitVector: null,
    textMatch: false,
    ...overrides,
  };
}

const now = new Date("2026-11-02T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRecentTriageHistory", () => {
  it("should list the week without embedding anything when no search text is given", async () => {
    repo.listRecentTriageDecisions.mockResolvedValue([row("a")]);

    const result = await getRecentTriageHistory({ days: 7, q: "", mode: "both" }, now);

    expect(embeddings.embedTexts).not.toHaveBeenCalled();
    expect(repo.listRecentTriageDecisions).toHaveBeenCalledWith(new Date("2026-10-26T00:00:00Z"), "");
    expect(result.decisions[0]).toMatchObject({
      id: "a",
      reasonCode: null,
      subjectType: "other",
      extractionModelId: "model-x",
      fusionModelIds: ["m1"],
    });
    expect(result.decisions[0]?.rejectReasonCodes).toContain("other");
  });

  it("should find a card by meaning using the stored card vector and embed unembedded ones on the fly", async () => {
    repo.listRecentTriageDecisions.mockResolvedValue([
      row("stored", { bitVector: [1, 0] }),
      row("fresh"),
      row("unrelated", { bitVector: [0, 1] }),
    ]);
    embeddings.embedTexts
      .mockResolvedValueOnce([{ id: "query", embedding: [1, 0] }])
      .mockResolvedValueOnce([{ id: "fresh", embedding: [0.9, 0.1] }]);

    const result = await getRecentTriageHistory({ days: 7, q: "idea", mode: "meaning" }, now);

    expect(result.meaningUnavailable).toBe(false);
    expect(result.decisions.map((item) => [item.id, item.matchedBy])).toEqual([
      ["stored", "meaning"],
      ["fresh", "meaning"],
    ]);
  });

  it("should fall back to word matches and say so when embeddings are unavailable", async () => {
    repo.listRecentTriageDecisions.mockResolvedValue([row("hit", { textMatch: true }), row("miss")]);
    embeddings.embedTexts.mockRejectedValue(new Error("budget"));

    const result = await getRecentTriageHistory({ days: 7, q: "hit", mode: "meaning" }, now);

    expect(result).toMatchObject({ mode: "text", meaningUnavailable: true });
    expect(result.decisions.map((item) => item.id)).toEqual(["hit"]);
  });

  it("should not call the embedding service for a words-only search", async () => {
    repo.listRecentTriageDecisions.mockResolvedValue([row("hit", { textMatch: true })]);

    const result = await getRecentTriageHistory({ days: 7, q: "hit", mode: "text" }, now);

    expect(embeddings.embedTexts).not.toHaveBeenCalled();
    expect(result.decisions[0]?.matchedBy).toBe("text");
  });
});
