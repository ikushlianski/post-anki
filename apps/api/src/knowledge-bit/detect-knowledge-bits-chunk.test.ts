import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  allChunksDeliberatelyEmpty,
  countUnseenStatements,
  writeAndValidate,
  type ChunkCards,
} from "./detect-knowledge-bits-chunk.js";
import type { GenerateItemsDeps } from "./detect-knowledge-bits.types.js";
import {
  normalizeStatement,
  validateSourceItems,
  type FlaggedLesson,
  type LessonDraft,
  type SourceItemBatchValidation,
} from "./knowledge-bit-source-item-validation.js";

vi.mock("../shared/log.js", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("./knowledge-bit-source-item-validation.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./knowledge-bit-source-item-validation.js")>()),
  validateSourceItems: vi.fn(),
}));

function lesson(statement: string): LessonDraft {
  return { statement, quote: "q", example: null, cards: [] };
}

function flagged(statement: string): FlaggedLesson {
  return { lesson: lesson(statement), reason: "quote_not_in_source" } as unknown as FlaggedLesson;
}

function validation(
  valid: LessonDraft[],
  options: Partial<SourceItemBatchValidation> = {},
): SourceItemBatchValidation {
  return { valid, dropped: [], rejected: [], ...options };
}

function depsReturning(...batches: LessonDraft[][]): GenerateItemsDeps {
  const writeItems = vi.fn();

  for (const batch of batches) writeItems.mockResolvedValueOnce(batch);

  return { writeItems } as unknown as GenerateItemsDeps;
}

describe("countUnseenStatements", () => {
  it("should count only statements not already seen, ignoring case and spacing", () => {
    const seen = new Set([normalizeStatement("HTTP is stateless")]);
    const valid = [lesson("  http is   stateless "), lesson("TCP is reliable")];

    expect(countUnseenStatements(valid, seen)).toBe(1);
  });

  it("should count zero when every statement was already seen", () => {
    const seen = new Set([normalizeStatement("A")]);

    expect(countUnseenStatements([lesson("a")], seen)).toBe(0);
  });
});

describe("allChunksDeliberatelyEmpty", () => {
  const empty: ChunkCards = { valid: [], flagged: [], deliberateEmpty: true };
  const real: ChunkCards = { valid: [lesson("x")], flagged: [] };

  it("should be true only when every chunk was deliberately empty", () => {
    expect(allChunksDeliberatelyEmpty([empty, empty])).toBe(true);
  });

  it("should be false when one chunk produced cards or failed", () => {
    expect(allChunksDeliberatelyEmpty([empty, real])).toBe(false);
    expect(allChunksDeliberatelyEmpty([empty, null])).toBe(false);
  });

  it("should be false for a source with no chunks", () => {
    expect(allChunksDeliberatelyEmpty([])).toBe(false);
  });
});

describe("writeAndValidate", () => {
  beforeEach(() => {
    vi.mocked(validateSourceItems).mockReset();
  });

  it("should return a deliberate empty chunk without validating or retrying", async () => {
    const writeItems = vi.fn(async (_chunk: string, options) => {
      options.onNothingWorthKeeping?.();

      return [];
    });

    const result = await writeAndValidate("chunk", {}, { writeItems } as unknown as GenerateItemsDeps);

    expect(result.deliberateEmpty).toBe(true);
    expect(writeItems).toHaveBeenCalledOnce();
    expect(validateSourceItems).not.toHaveBeenCalled();
  });

  it("should not retry when most drafts are valid", async () => {
    vi.mocked(validateSourceItems).mockReturnValueOnce(validation([lesson("a"), lesson("b")], { dropped: ["empty"] }));
    const deps = depsReturning([lesson("a"), lesson("b"), lesson("c")]);

    const result = await writeAndValidate("chunk", {}, deps);

    expect(result.valid).toHaveLength(2);
    expect(deps.writeItems).toHaveBeenCalledOnce();
  });

  it("should keep the retry when it yields more valid lessons than the first try", async () => {
    vi.mocked(validateSourceItems)
      .mockReturnValueOnce(validation([], { dropped: ["empty"] }))
      .mockReturnValueOnce(validation([lesson("a"), lesson("b")]));
    const deps = depsReturning([lesson("x")], [lesson("a"), lesson("b")]);

    const result = await writeAndValidate("chunk", {}, deps);

    expect(result.valid).toHaveLength(2);
    expect(deps.writeItems).toHaveBeenCalledTimes(2);
  });

  it("should keep the first try when the retry yields fewer valid lessons", async () => {
    vi.mocked(validateSourceItems)
      .mockReturnValueOnce(validation([lesson("a")], { dropped: ["empty", "empty"] }))
      .mockReturnValueOnce(validation([]));
    const deps = depsReturning([lesson("a"), lesson("x"), lesson("y")], [lesson("z")]);

    const result = await writeAndValidate("chunk", {}, deps);

    expect(result.valid).toEqual([lesson("a")]);
  });

  it("should keep the first try when the retry ties on valid lessons", async () => {
    const first = validation([lesson("a")], { dropped: ["empty"] });
    vi.mocked(validateSourceItems)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(validation([lesson("b")], { dropped: ["empty"] }));
    const deps = depsReturning([lesson("a"), lesson("x")], [lesson("b"), lesson("y")]);

    const result = await writeAndValidate("chunk", {}, deps);

    expect(result.valid).toEqual([lesson("a")]);
  });

  it("should prefer the retry's flagged lessons when neither try has valid ones", async () => {
    vi.mocked(validateSourceItems)
      .mockReturnValueOnce(validation([], { dropped: ["empty"], rejected: [flagged("a")] }))
      .mockReturnValueOnce(validation([], { dropped: ["empty"], rejected: [flagged("a"), flagged("b")] }));
    const deps = depsReturning([lesson("x")], [lesson("y")]);

    const result = await writeAndValidate("chunk", {}, deps);

    expect(result.flagged).toHaveLength(2);
  });

  it("should retry with strict language when every drop was a wrong-language drop", async () => {
    vi.mocked(validateSourceItems)
      .mockReturnValueOnce(validation([], { dropped: ["wrong_language"] }))
      .mockReturnValueOnce(validation([lesson("a")]));
    const deps = depsReturning([lesson("x")], [lesson("a")]);

    await writeAndValidate("chunk", {}, deps);

    expect(deps.writeItems).toHaveBeenLastCalledWith("chunk", expect.objectContaining({ strictLanguage: true }));
  });

  it("should fall back to the first try's cards when the retry throws", async () => {
    vi.mocked(validateSourceItems).mockReturnValueOnce(validation([lesson("a")], { dropped: ["empty", "empty"] }));
    const writeItems = vi
      .fn()
      .mockResolvedValueOnce([lesson("a"), lesson("x"), lesson("y")])
      .mockRejectedValueOnce(new Error("model down"));

    const result = await writeAndValidate("chunk", {}, { writeItems } as unknown as GenerateItemsDeps);

    expect(result.valid).toEqual([lesson("a")]);
  });

  it("should surface the retry error when the first try had nothing to keep", async () => {
    vi.mocked(validateSourceItems).mockReturnValueOnce(validation([], { dropped: ["empty"] }));
    const writeItems = vi
      .fn()
      .mockResolvedValueOnce([lesson("x")])
      .mockRejectedValueOnce(new Error("model down"));

    await expect(
      writeAndValidate("chunk", {}, { writeItems } as unknown as GenerateItemsDeps),
    ).rejects.toThrow("model down");
  });
});
