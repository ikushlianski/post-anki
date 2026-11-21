import { beforeEach, describe, expect, it, vi } from "vitest";
import { processChunk, writeAndValidate } from "./detect-knowledge-bits-chunk.js";
import type { GenerateItemsDeps, RunState, WriteOptions } from "./detect-knowledge-bits.types.js";
import { validateSourceItems, type LessonDraft } from "./knowledge-bit-source-item-validation.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";

vi.mock("../shared/log.js", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("./knowledge-bit-source-item-validation.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./knowledge-bit-source-item-validation.js")>()),
  validateSourceItems: vi.fn(),
}));

const CHUNK = "HTTP is stateless because each request carries everything the server needs.";
const BLOCK = "<known_cards>already known</known_cards>";
const SOURCE = { id: "ks_1", claimedAt: new Date("2026-10-01T10:00:00.000Z") } as PendingKnowledgeSource;

function lesson(): LessonDraft {
  return { statement: "HTTP is stateless", quote: "HTTP is stateless", example: null, cards: [] };
}

function state(): RunState {
  return {
    seenStatements: new Set(),
    accepted: 0,
    inserted: 0,
    reclaimed: null,
    deliberateEmptyChunks: 0,
    capped: false,
    gapByChunk: new Map(),
  };
}

function acceptAll(): void {
  vi.mocked(validateSourceItems).mockImplementation((drafts) => ({ valid: [...drafts], dropped: [], rejected: [] }));
}

function deps(overrides: Partial<GenerateItemsDeps> = {}) {
  const writeItems = vi.fn().mockResolvedValue([lesson()]);
  const insertItems = vi.fn().mockResolvedValue(1);

  return {
    writeItems,
    insertItems,
    deps: { writeItems, insertItems, ...overrides } as unknown as GenerateItemsDeps,
  };
}

async function run(d: GenerateItemsDeps, index = 0, options: WriteOptions = {}) {
  await processChunk(CHUNK, index, { source: SOURCE, options, firstOrdinal: 0, state: state(), deps: d });
}

describe("processChunk known cards", () => {
  beforeEach(acceptAll);

  it("should pass the resolved block to the writer for the chunk", async () => {
    const loadKnownCards = vi.fn().mockResolvedValue(BLOCK);
    const { writeItems, deps: d } = deps({ loadKnownCards });

    await run(d, 2);

    expect(loadKnownCards).toHaveBeenCalledWith(CHUNK, { knowledgeSourceId: "ks_1", chunkIndex: 2 });
    expect(writeItems).toHaveBeenCalledWith(CHUNK, expect.objectContaining({ knownCardsBlock: BLOCK }));
  });

  it("should leave the writer options unchanged when the block is empty", async () => {
    const { writeItems, deps: d } = deps({ loadKnownCards: vi.fn().mockResolvedValue("") });

    await run(d);

    expect(vi.mocked(writeItems).mock.calls[0]![1]).not.toHaveProperty("knownCardsBlock");
  });

  it("should still write cards exactly as before when the lookup fails", async () => {
    const { writeItems, insertItems, deps: d } = deps({ loadKnownCards: vi.fn().mockRejectedValue(new Error("boom")) });

    await run(d);

    expect(vi.mocked(writeItems).mock.calls[0]![1]).not.toHaveProperty("knownCardsBlock");
    expect(insertItems).toHaveBeenCalledTimes(1);
  });

  it("should not look anything up when no lookup is configured", async () => {
    const { writeItems, deps: d } = deps();

    await run(d);

    expect(vi.mocked(writeItems).mock.calls[0]![1]).not.toHaveProperty("knownCardsBlock");
  });

  it("should skip the lookup for chunks past the per-source limit", async () => {
    const loadKnownCards = vi.fn().mockResolvedValue(BLOCK);
    const { writeItems, deps: d } = deps({ loadKnownCards });

    await run(d, 8);

    expect(loadKnownCards).not.toHaveBeenCalled();
    expect(vi.mocked(writeItems).mock.calls[0]![1]).not.toHaveProperty("knownCardsBlock");
  });

  it("should resolve the block once per chunk even when fusion calls several models", async () => {
    const loadKnownCards = vi.fn().mockResolvedValue(BLOCK);
    const { writeItems, deps: d } = deps({ loadKnownCards });

    await run(d, 0, { fusionModelIds: ["m1", "m2"] });

    expect(loadKnownCards).toHaveBeenCalledTimes(1);
    expect(writeItems).toHaveBeenCalledTimes(2);

    for (const call of vi.mocked(writeItems).mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ knownCardsBlock: BLOCK }));
    }
  });

  it("should hand the same block to the validation retry call", async () => {
    vi.mocked(validateSourceItems).mockReturnValue({ valid: [], dropped: ["wrong_language"], rejected: [] });

    const writeItems = vi.fn().mockResolvedValue([lesson()]);
    const d = { writeItems } as unknown as GenerateItemsDeps;

    await writeAndValidate(CHUNK, { knownCardsBlock: BLOCK }, d);

    expect(writeItems).toHaveBeenCalledTimes(2);

    for (const call of writeItems.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ knownCardsBlock: BLOCK }));
    }
  });
});
