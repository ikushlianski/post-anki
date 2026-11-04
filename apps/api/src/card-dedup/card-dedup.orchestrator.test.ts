import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../shared/embeddings-client.js", () => ({ embedTexts: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-embedding.repo.js", () => ({ searchApprovedBitsByEmbedding: vi.fn() }));
vi.mock("./card-dedup.repo.js", () => ({ listBitsAwaitingDedup: vi.fn(), recordDuplicateCheck: vi.fn() }));
vi.mock("../mastra/card-dedup-escalation.agent.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mastra/card-dedup-escalation.agent.js")>()),
  runCardDedupEscalation: vi.fn(),
}));

import { embedTexts } from "../shared/embeddings-client.js";
import { searchApprovedBitsByEmbedding } from "../knowledge-bit/knowledge-bit-embedding.repo.js";
import { buildDedupPrompt, runCardDedupEscalation } from "../mastra/card-dedup-escalation.agent.js";
import { runCardDedupScan } from "./card-dedup.orchestrator.js";
import { listBitsAwaitingDedup, recordDuplicateCheck } from "./card-dedup.repo.js";

function hit(id: string, similarity: number) {
  return [{ id, body: `body of ${id}`, similarity }];
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.CARD_DEDUP_ENABLED;
  vi.mocked(listBitsAwaitingDedup).mockResolvedValue([
    { id: "a", body: "card a" },
    { id: "b", body: "card b" },
    { id: "c", body: "card c" },
  ]);
  vi.mocked(embedTexts).mockImplementation(async (items) => items.map((item) => ({ id: item.id, embedding: [1] })));
  vi.mocked(runCardDedupEscalation).mockImplementation(async (pairs, maxChars) => ({
    output: { pairs: pairs.map((_pair, index) => ({ pair: `P${index + 1}`, same: true, reason: "Adds nothing new." })) },
    prompt: buildDedupPrompt(pairs, maxChars),
  }));
});

describe("runCardDedupScan", () => {
  it("should flag exact copies for free and ask the model only about close calls", async () => {
    vi.mocked(searchApprovedBitsByEmbedding)
      .mockResolvedValueOnce(hit("old_a", 0.99))
      .mockResolvedValueOnce(hit("old_b", 0.9))
      .mockResolvedValueOnce([]);

    const result = await runCardDedupScan();

    expect(result).toEqual({ checked: 3, flagged: 2, escalated: 1 });
    expect(runCardDedupEscalation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runCardDedupEscalation).mock.calls[0]?.[0].map((pair) => pair.bitId)).toEqual(["b"]);
    expect(recordDuplicateCheck).toHaveBeenCalledWith("a", {
      bitId: "old_a",
      similarity: 0.99,
      reason: "Near-identical wording to an existing card.",
      similarBitIds: ["old_a"],
    });
    expect(recordDuplicateCheck).toHaveBeenCalledWith("b", {
      bitId: "old_b",
      similarity: 0.9,
      reason: "Adds nothing new.",
      similarBitIds: ["old_b"],
    });
    expect(recordDuplicateCheck).toHaveBeenCalledWith("c", null);
  });

  it("should store every similar card the search returned, capped per card", async () => {
    vi.mocked(listBitsAwaitingDedup).mockResolvedValue([{ id: "a", body: "card a" }]);
    vi.mocked(searchApprovedBitsByEmbedding).mockResolvedValue([
      { id: "old_1", body: "one", similarity: 0.97 },
      { id: "old_2", body: "two", similarity: 0.9 },
    ]);

    await runCardDedupScan();

    expect(searchApprovedBitsByEmbedding).toHaveBeenCalledWith([1], 3, 0.85);
    expect(recordDuplicateCheck).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ similarBitIds: ["old_1", "old_2"] }),
    );
  });

  it("should not flag a close call the model says is different", async () => {
    vi.mocked(listBitsAwaitingDedup).mockResolvedValue([{ id: "b", body: "card b" }]);
    vi.mocked(searchApprovedBitsByEmbedding).mockResolvedValue(hit("old_b", 0.9));
    vi.mocked(runCardDedupEscalation).mockImplementation(async (pairs, maxChars) => ({
      output: { pairs: [{ pair: "P1", same: false, reason: "Adds a new case." }] },
      prompt: buildDedupPrompt(pairs, maxChars),
    }));

    await runCardDedupScan();

    expect(recordDuplicateCheck).toHaveBeenCalledWith("b", null);
  });

  it("should leave close calls unflagged but settled when the model call fails", async () => {
    vi.mocked(listBitsAwaitingDedup).mockResolvedValue([{ id: "b", body: "card b" }]);
    vi.mocked(searchApprovedBitsByEmbedding).mockResolvedValue(hit("old_b", 0.9));
    vi.mocked(runCardDedupEscalation).mockRejectedValue(new Error("boom"));

    const result = await runCardDedupScan();

    expect(result.flagged).toBe(0);
    expect(recordDuplicateCheck).toHaveBeenCalledWith("b", null);
  });

  it("should send at most the pair cap to the model and retry the rest on the next scan", async () => {
    const bits = Array.from({ length: 14 }, (_unused, index) => ({ id: `n${index}`, body: `card ${index}` }));

    vi.mocked(listBitsAwaitingDedup).mockResolvedValue(bits);
    vi.mocked(searchApprovedBitsByEmbedding).mockResolvedValue(hit("old", 0.9));

    const result = await runCardDedupScan();

    expect(vi.mocked(runCardDedupEscalation).mock.calls[0]?.[0]).toHaveLength(10);
    expect(result.checked).toBe(10);
    expect(recordDuplicateCheck).not.toHaveBeenCalledWith("n13", expect.anything());
  });

  it("should skip bits whose embedding failed so they are retried later", async () => {
    vi.mocked(embedTexts).mockResolvedValue([{ id: "a", embedding: [1] }]);
    vi.mocked(searchApprovedBitsByEmbedding).mockResolvedValue([]);

    await runCardDedupScan();

    expect(recordDuplicateCheck).toHaveBeenCalledTimes(1);
    expect(recordDuplicateCheck).toHaveBeenCalledWith("a", null);
  });

  it("should do nothing when switched off", async () => {
    process.env.CARD_DEDUP_ENABLED = "off";

    const result = await runCardDedupScan();

    expect(result).toEqual({ checked: 0, flagged: 0, escalated: 0 });
    expect(listBitsAwaitingDedup).not.toHaveBeenCalled();
  });
});
