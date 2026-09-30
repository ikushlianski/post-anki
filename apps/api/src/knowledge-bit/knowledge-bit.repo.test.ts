import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockDb, mockDbState, resetMockDbState, seedSource } from "./knowledge-bit-repo.test-mock-db.js";

vi.mock("../db/client.js", () => ({
  getDb: () => buildMockDb(),
}));

const {
  insertKnowledgeBits,
  claimPendingKnowledgeSources,
  markKnowledgeSourceFailed,
  markKnowledgeSourceBitsDetected,
  insertKnowledgeBitsAndMarkDetected,
} = await import("./knowledge-bit.repo.js");

beforeEach(() => {
  resetMockDbState();
});

describe("insertKnowledgeBits", () => {
  it("inserts one row per bit, ordinal matching the array index", async () => {
    await insertKnowledgeBits("ks_1", [
      { text: "First bit.", background: null },
      { text: "Second bit.", background: null },
      { text: "Third bit.", background: null },
    ]);

    expect(mockDbState.bits).toEqual([
      { id: expect.stringMatching(/^kb_/), knowledgeSourceId: "ks_1", ordinal: 0, body: "First bit.", background: null },
      { id: expect.stringMatching(/^kb_/), knowledgeSourceId: "ks_1", ordinal: 1, body: "Second bit.", background: null },
      { id: expect.stringMatching(/^kb_/), knowledgeSourceId: "ks_1", ordinal: 2, body: "Third bit.", background: null },
    ]);
  });

  it("persists a non-null background string exactly as given", async () => {
    await insertKnowledgeBits("ks_1", [
      { text: "Bit with background.", background: "Context the reader needs first." },
    ]);

    expect(mockDbState.bits).toEqual([
      {
        id: expect.stringMatching(/^kb_/),
        knowledgeSourceId: "ks_1",
        ordinal: 0,
        body: "Bit with background.",
        background: "Context the reader needs first.",
      },
    ]);
  });

  it("skips a bit whose (sourceId, ordinal) already exists instead of duplicating it", async () => {
    await insertKnowledgeBits("ks_1", [
      { text: "First bit.", background: null },
      { text: "Second bit.", background: null },
    ]);
    await insertKnowledgeBits("ks_1", [
      { text: "First bit re-detected.", background: null },
      { text: "Second bit re-detected.", background: null },
    ]);

    expect(mockDbState.bits).toHaveLength(2);
    expect(mockDbState.bits.map((bit) => bit.body)).toEqual(["First bit.", "Second bit."]);
  });
});

describe("claimPendingKnowledgeSources", () => {
  it("claims up to the given limit of pending sources, flipping them to processing", async () => {
    seedSource({ id: "ks_1", rawText: "text one" });
    seedSource({ id: "ks_2", rawText: "text two" });
    seedSource({ id: "ks_3", status: "bits_detected" });

    const claimed = await claimPendingKnowledgeSources(10);

    expect(claimed).toEqual(
      expect.arrayContaining([
        { id: "ks_1", rawText: "text one", claimedAt: expect.any(Date) },
        { id: "ks_2", rawText: "text two", claimedAt: expect.any(Date) },
      ]),
    );
    expect(claimed).toHaveLength(2);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("processing");
    expect(mockDbState.sources.get("ks_2")?.status).toBe("processing");
    expect(mockDbState.sources.get("ks_3")?.status).toBe("bits_detected");
  });

  it("excludes a source that lost the race to a concurrent claim instead of erroring", async () => {
    seedSource({ id: "ks_1", rawText: "text one" });
    seedSource({ id: "ks_2", rawText: "text two" });
    mockDbState.raceStealAfterSelectId = "ks_1";

    const claimed = await claimPendingKnowledgeSources(10);

    expect(claimed).toEqual([{ id: "ks_2", rawText: "text two", claimedAt: expect.any(Date) }]);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("processing");
  });

  it("gives each claimed source its own updatedAt as an ownership token", async () => {
    seedSource({ id: "ks_1" });

    const [claimedRow] = await claimPendingKnowledgeSources(10);

    expect(claimedRow?.claimedAt.getTime()).toBe(mockDbState.sources.get("ks_1")?.updatedAt.getTime());
  });
});

describe("markKnowledgeSourceFailed", () => {
  it("sets status to failed with the given reason when the caller still owns the claim", async () => {
    const source = seedSource({ id: "ks_1", status: "processing" });

    const changed = await markKnowledgeSourceFailed("ks_1", "source_too_long", source.updatedAt);

    expect(changed).toBe(true);
    expect(mockDbState.sources.get("ks_1")).toMatchObject({
      status: "failed",
      failureReason: "source_too_long",
    });
  });

  it("does nothing to a source that isn't currently processing", async () => {
    const source = seedSource({ id: "ks_1", status: "bits_detected" });

    const changed = await markKnowledgeSourceFailed("ks_1", "source_too_long", source.updatedAt);

    expect(changed).toBe(false);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("bits_detected");
    expect(mockDbState.sources.get("ks_1")?.failureReason).toBeNull();
  });

  it("does nothing when the claim token no longer matches (the row was reclaimed)", async () => {
    seedSource({ id: "ks_1", status: "processing", updatedAt: new Date(2020, 0, 1) });
    const staleToken = new Date(2019, 0, 1);

    const changed = await markKnowledgeSourceFailed("ks_1", "source_too_long", staleToken);

    expect(changed).toBe(false);
    expect(mockDbState.sources.get("ks_1")).toMatchObject({ status: "processing", failureReason: null });
  });
});

describe("markKnowledgeSourceBitsDetected", () => {
  it("sets status to bits_detected and clears any prior failure reason", async () => {
    const source = seedSource({
      id: "ks_1",
      status: "processing",
      failureReason: "source_too_long",
    });

    const changed = await markKnowledgeSourceBitsDetected("ks_1", source.updatedAt);

    expect(changed).toBe(true);
    expect(mockDbState.sources.get("ks_1")).toMatchObject({
      status: "bits_detected",
      failureReason: null,
    });
  });

  it("does nothing to a source that isn't currently processing", async () => {
    const source = seedSource({ id: "ks_1", status: "failed", failureReason: "source_too_long" });

    const changed = await markKnowledgeSourceBitsDetected("ks_1", source.updatedAt);

    expect(changed).toBe(false);
    expect(mockDbState.sources.get("ks_1")).toMatchObject({
      status: "failed",
      failureReason: "source_too_long",
    });
  });

  it("does nothing when the claim token no longer matches (the row was reclaimed)", async () => {
    seedSource({ id: "ks_1", status: "processing", updatedAt: new Date(2020, 0, 1) });
    const staleToken = new Date(2019, 0, 1);

    const changed = await markKnowledgeSourceBitsDetected("ks_1", staleToken);

    expect(changed).toBe(false);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("processing");
  });
});

describe("insertKnowledgeBitsAndMarkDetected", () => {
  it("inserts the bits and marks the source detected together when the claim is still owned", async () => {
    const source = seedSource({ id: "ks_1", status: "processing" });

    await insertKnowledgeBitsAndMarkDetected(
      "ks_1",
      [
        { text: "First bit.", background: null },
        { text: "Second bit.", background: null },
      ],
      source.updatedAt,
    );

    expect(mockDbState.bits).toHaveLength(2);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("bits_detected");
  });

  it("throws and inserts no bits when the source was reclaimed by another scan first", async () => {
    seedSource({ id: "ks_1", status: "processing", updatedAt: new Date(2020, 0, 1) });
    const staleToken = new Date(2019, 0, 1);

    await expect(
      insertKnowledgeBitsAndMarkDetected(
        "ks_1",
        [{ text: "A bit that must not land.", background: null }],
        staleToken,
      ),
    ).rejects.toThrow("knowledge_source_reclaimed");

    expect(mockDbState.bits).toHaveLength(0);
    expect(mockDbState.sources.get("ks_1")?.status).toBe("processing");
  });
});
