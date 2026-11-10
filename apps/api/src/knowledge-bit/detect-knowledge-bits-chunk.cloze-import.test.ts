import { describe, expect, it, vi } from "vitest";
import { writeAndValidate } from "./detect-knowledge-bits-chunk.js";
import type { GenerateItemsDeps, WriteOptions } from "./detect-knowledge-bits.types.js";
import { itemsForChunk } from "./knowledge-bit-source-items.test-mocks.js";

vi.mock("../shared/log.js", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const CHUNK = "A marker sentence 0 is the claim.";

function depsWith(writeItems: GenerateItemsDeps["writeItems"], enrichItems?: GenerateItemsDeps["enrichItems"]) {
  return { writeItems, enrichItems, loadFeedbackBlock: vi.fn() } as unknown as GenerateItemsDeps;
}

describe("writeAndValidate for an Anki import chunk", () => {
  it("should hand the chunk to the model instead of building a cloze card", async () => {
    const writeItems = vi.fn().mockResolvedValue(itemsForChunk("A", 1));
    const result = await writeAndValidate(CHUNK, { ankiImport: true } as WriteOptions, depsWith(writeItems));

    expect(writeItems).toHaveBeenCalled();
    expect(result.valid.flatMap((draft) => draft.cards).map((card) => card.kind)).toEqual(["basic"]);
  });

  it("should keep the search budget away from the model", async () => {
    const writeItems = vi.fn().mockResolvedValue(itemsForChunk("A", 1));

    await writeAndValidate(CHUNK, { ankiImport: true, webSearchBudget: 2 }, depsWith(writeItems, vi.fn()));

    expect(writeItems.mock.calls[0]?.[1]).not.toHaveProperty("webSearchBudget");
  });

  it("should enrich the valid drafts with the chunk budget", async () => {
    const drafts = itemsForChunk("A", 1);
    const writeItems = vi.fn().mockResolvedValue(drafts);
    const enrichItems = vi.fn(async (items) => items);

    await writeAndValidate(CHUNK, { ankiImport: true, webSearchBudget: 2 }, depsWith(writeItems, enrichItems));

    expect(enrichItems).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ statement: drafts[0]?.statement })]), 2);
  });

  it("should not enrich a chunk that has no search budget", async () => {
    const writeItems = vi.fn().mockResolvedValue(itemsForChunk("A", 1));
    const enrichItems = vi.fn(async (items) => items);

    await writeAndValidate(CHUNK, { ankiImport: true, webSearchBudget: 0 }, depsWith(writeItems, enrichItems));
    await writeAndValidate(CHUNK, {}, depsWith(writeItems, enrichItems));

    expect(enrichItems).not.toHaveBeenCalled();
  });
});
