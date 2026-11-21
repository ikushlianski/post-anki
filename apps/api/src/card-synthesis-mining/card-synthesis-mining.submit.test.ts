import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = { tx: true };

vi.mock("../db/client.js", () => ({
  getDb: () => ({ transaction: (fn: (t: unknown) => Promise<void>) => fn(tx) }),
}));
vi.mock("../knowledge-source/knowledge-source-keyed-insert.repo.js", () => ({
  insertKeyedKnowledgeSources: vi.fn(),
  findSourcesByImportKeys: vi.fn(),
}));
vi.mock("../knowledge-bit/knowledge-bit-manual-item.repo.js", () => ({ insertPendingManualItem: vi.fn() }));

import { insertPendingManualItem } from "../knowledge-bit/knowledge-bit-manual-item.repo.js";
import { insertKeyedKnowledgeSources } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { composeOverviewCard, submitOverview, synthesisImportKey } from "./card-synthesis-mining.submit.js";
import type { OverviewCard } from "./card-synthesis-mining.types.js";

const card: OverviewCard = { front: "Front?", back: "Back", example: "Ex", evidenceBitIds: ["a"], evidenceLink: [] };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("synthesisImportKey", () => {
  it("should give the same key for the same evidence in any order so reruns never duplicate", () => {
    expect(synthesisImportKey("s", ["b", "a", "c"])).toBe(synthesisImportKey("s", ["c", "b", "a"]));
    expect(synthesisImportKey("s", ["a", "b"])).not.toBe(synthesisImportKey("s", ["a", "c"]));
  });
});

describe("composeOverviewCard", () => {
  it("should number the steps and list only cited cards as background", () => {
    const composed = composeOverviewCard(
      "Seq?",
      { lead: "Lead.", steps: [{ technique: "Open", text: "Say hi", evidenceBitIds: ["b"] }] },
      [
        { id: "a", question: "Unused", answer: "x" },
        { id: "b", question: "Open how?", answer: "y" },
      ],
    );

    expect(composed.back).toBe("Lead.\n1. Open: Say hi");
    expect(composed.example).toBe("Built from 1 cards:\n- Open how?");
    expect(composed.evidenceBitIds).toEqual(["b"]);
  });
});

describe("submitOverview", () => {
  it("should file a synthesis-origin source and insert the card as pending, never approved", async () => {
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([{ id: "ks1" }] as never);
    vi.mocked(insertPendingManualItem).mockResolvedValue({ id: "kb1" } as never);

    const result = await submitOverview(card, "subj", "synthesis:subj:k");

    expect(result).toEqual({ status: "created", sourceId: "ks1", bitId: "kb1" });
    expect(insertKeyedKnowledgeSources).toHaveBeenCalledWith(expect.any(Array), "subj", tx, {
      origin: "synthesis",
      status: "detected",
    });
    expect(insertPendingManualItem).toHaveBeenCalledWith(
      tx,
      "ks1",
      expect.objectContaining({ aiGenerated: true }),
      { approvalState: "pending" },
    );
  });

  it("should add nothing when the keyed source already exists", async () => {
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([]);

    await expect(submitOverview(card, "subj", "k")).resolves.toEqual({ status: "already_present" });
    expect(insertPendingManualItem).not.toHaveBeenCalled();
  });

  it("should roll back the source when the card is a duplicate", async () => {
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([{ id: "ks1" }] as never);
    vi.mocked(insertPendingManualItem).mockResolvedValue({ ok: false, error: "duplicate_card" });

    await expect(submitOverview(card, "subj", "k")).resolves.toEqual({ status: "already_present" });
  });
});
