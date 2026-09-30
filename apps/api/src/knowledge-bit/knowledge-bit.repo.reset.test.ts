import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockDb, mockDbState, resetMockDbState, seedSource } from "./knowledge-bit-repo.test-mock-db.js";

vi.mock("../db/client.js", () => ({
  getDb: () => buildMockDb(),
}));

const {
  claimPendingKnowledgeSources,
  insertKnowledgeBitsAndMarkDetected,
  resetStaleProcessingKnowledgeSources,
} = await import("./knowledge-bit.repo.js");

beforeEach(() => {
  resetMockDbState();
});

describe("resetStaleProcessingKnowledgeSources", () => {
  const STALE_MS = 15 * 60 * 1000;

  it("resets a processing source older than the threshold to pending and clears its failure reason", async () => {
    seedSource({
      id: "ks_1",
      status: "processing",
      failureReason: "some stale reason",
      updatedAt: new Date(Date.now() - STALE_MS - 1000),
    });

    const count = await resetStaleProcessingKnowledgeSources(STALE_MS);

    expect(count).toBe(1);
    expect(mockDbState.sources.get("ks_1")).toMatchObject({ status: "pending", failureReason: null });
  });

  it("leaves a processing source younger than the threshold untouched", async () => {
    seedSource({
      id: "ks_1",
      status: "processing",
      updatedAt: new Date(Date.now() - 1000),
    });

    const count = await resetStaleProcessingKnowledgeSources(STALE_MS);

    expect(count).toBe(0);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("processing");
  });

  it.each(["pending", "bits_detected", "failed"])(
    "never touches a %s source regardless of how old its updatedAt is",
    async (status) => {
      seedSource({
        id: "ks_1",
        status,
        updatedAt: new Date(Date.now() - STALE_MS - 1000),
      });

      const count = await resetStaleProcessingKnowledgeSources(STALE_MS);

      expect(count).toBe(0);
      expect(mockDbState.sources.get("ks_1")?.status).toBe(status);
    },
  );

  it("is a no-op when nothing is stale", async () => {
    seedSource({ id: "ks_1", status: "pending" });
    seedSource({ id: "ks_2", status: "bits_detected" });

    await expect(resetStaleProcessingKnowledgeSources(STALE_MS)).resolves.toBe(0);
  });

  it("makes a reset source claimable again on the next claim call", async () => {
    seedSource({
      id: "ks_1",
      status: "processing",
      rawText: "some prose",
      updatedAt: new Date(Date.now() - STALE_MS - 1000),
    });

    await resetStaleProcessingKnowledgeSources(STALE_MS);
    const claimed = await claimPendingKnowledgeSources(10);

    expect(claimed).toEqual([{ id: "ks_1", rawText: "some prose", claimedAt: expect.any(Date) }]);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("processing");
  });

  it("stops a late-finishing first attempt from corrupting a row reclaimed after a reset", async () => {
    seedSource({
      id: "ks_1",
      status: "processing",
      rawText: "some prose",
      updatedAt: new Date(Date.now() - STALE_MS - 1000),
    });
    const staleFirstAttemptToken = mockDbState.sources.get("ks_1")!.updatedAt;

    await resetStaleProcessingKnowledgeSources(STALE_MS);
    const [reclaimedByScanTwo] = await claimPendingKnowledgeSources(10);

    await expect(
      insertKnowledgeBitsAndMarkDetected(
        "ks_1",
        [{ text: "Bit from the late first attempt.", background: null }],
        staleFirstAttemptToken,
      ),
    ).rejects.toThrow("knowledge_source_reclaimed");

    expect(mockDbState.bits).toHaveLength(0);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("processing");
    expect(reclaimedByScanTwo?.id).toBe("ks_1");
  });
});
