import { describe, expect, it } from "vitest";
import type { TriageHistoryRow } from "./card-triage-history.repo.js";
import { cosineSimilarity, rankHistoryRows } from "./triage-history-ranking.js";

function row(id: string, overrides: Partial<TriageHistoryRow> = {}, minutesAgo = 0): TriageHistoryRow {
  return {
    id,
    sessionId: "cts_1",
    bitId: `kb_${id}`,
    verdict: "rejected",
    reasonCode: null,
    note: null,
    decidedAt: new Date(Date.UTC(2026, 10, 1, 12, 0) - minutesAgo * 60_000),
    front: id,
    back: null,
    subjectId: null,
    extractionModelId: null,
    fusionModelIds: null,
    bitBody: null,
    bitVector: null,
    textMatch: false,
    ...overrides,
  };
}

describe("triage history ranking", () => {
  it("should keep every decision in recency order when nothing is searched", () => {
    const ranked = rankHistoryRows([row("a"), row("b", {}, 5)], { query: "", useText: true, similarities: null });

    expect(ranked.map((item) => [item.row.id, item.matchedBy])).toEqual([
      ["a", null],
      ["b", null],
    ]);
  });

  it("should put a decision found by both words and meaning ahead of meaning-only and drop weak matches", () => {
    const rows = [row("meaning-only"), row("both", { textMatch: true }, 5), row("weak"), row("text-only", { textMatch: true }, 9)];
    const similarities = new Map([
      ["meaning-only", 0.8],
      ["both", 0.5],
      ["weak", 0.1],
    ]);
    const ranked = rankHistoryRows(rows, { query: "q", useText: true, similarities });

    expect(ranked.map((item) => [item.row.id, item.matchedBy])).toEqual([
      ["both", "both"],
      ["text-only", "text"],
      ["meaning-only", "meaning"],
    ]);
  });

  it("should ignore word matches when only meaning search was asked for", () => {
    const ranked = rankHistoryRows([row("a", { textMatch: true })], {
      query: "q",
      useText: false,
      similarities: new Map(),
    });

    expect(ranked).toEqual([]);
  });

  it("should score identical directions as 1 and an empty vector as 0", () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
