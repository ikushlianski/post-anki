import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/embeddings-client.js", () => ({ embedTexts: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-embedding.repo.js", () => ({ searchApprovedBitsByEmbedding: vi.fn() }));

import { searchApprovedBitsByEmbedding } from "../knowledge-bit/knowledge-bit-embedding.repo.js";
import { embedTexts } from "../shared/embeddings-client.js";
import { hasNearDuplicateOverview } from "./card-synthesis-mining.duplicate-gate.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(embedTexts).mockResolvedValue([{ id: "intent", embedding: [1, 0] }] as never);
});

describe("hasNearDuplicateOverview", () => {
  it("should search approved cards at the 0.85 duplicate threshold with the audit ids", async () => {
    vi.mocked(searchApprovedBitsByEmbedding).mockResolvedValue([]);

    await hasNearDuplicateOverview("Title", { runId: "r1", clusterId: "c1" });

    expect(searchApprovedBitsByEmbedding).toHaveBeenCalledWith([1, 0], 1, 0.85);
    expect(embedTexts).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ runId: "r1", clusterId: "c1" }));
  });

  it("should report a duplicate when an approved card is that close", async () => {
    vi.mocked(searchApprovedBitsByEmbedding).mockResolvedValue([{ id: "kb", body: "b", similarity: 0.9 }]);

    await expect(hasNearDuplicateOverview("Title", {})).resolves.toBe(true);
  });
});
