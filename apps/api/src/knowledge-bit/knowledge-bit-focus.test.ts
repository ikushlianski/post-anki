import { describe, expect, it } from "vitest";
import { focusExcerpts, markedRangesInChunk, planFocusedChunks, quoteOverlapsFocus } from "./knowledge-bit-focus.js";
import { chunkSourceTextWithOffsets } from "./knowledge-bit-source-chunking.js";

const PARAGRAPHS = ["Alpha paragraph about salt.", "Beta paragraph about pepper.", "Gamma paragraph about sugar."];
const TEXT = PARAGRAPHS.join("\n\n");

function rangeOf(needle: string, length = needle.length) {
  const start = TEXT.indexOf(needle);

  return { start, end: start + length };
}

describe("chunk offsets", () => {
  it("should map every chunk segment back to the exact source text", () => {
    const text = `${"Sentence number one is here. ".repeat(40)}\n\n  ${"Another sentence follows now. ".repeat(40)}`;
    const chunks = chunkSourceTextWithOffsets(text, 300);

    expect(chunks.length).toBeGreaterThan(2);

    for (const chunk of chunks) {
      for (const segment of chunk.segments) {
        expect(chunk.text.slice(segment.chunkOffset, segment.chunkOffset + segment.length)).toBe(
          text.slice(segment.sourceStart, segment.sourceStart + segment.length),
        );
      }
    }
  });
});

describe("planFocusedChunks", () => {
  it("should keep every chunk unfocused when the learner marked nothing", () => {
    const planned = planFocusedChunks(chunkSourceTextWithOffsets(TEXT, 40), []);

    expect(planned.map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(planned.every((entry) => entry.focus.length === 0)).toBe(true);
  });

  it("should skip chunks without marks and keep the original chunk index", () => {
    const planned = planFocusedChunks(chunkSourceTextWithOffsets(TEXT, 40), [rangeOf("Gamma", 5)]);

    expect(planned).toHaveLength(1);
    expect(planned[0]?.index).toBe(2);
    expect(focusExcerpts(planned[0]?.chunk ?? "", planned[0]?.focus ?? [])).toEqual(["Gamma"]);
  });

  it("should split a mark that spans two chunks into one excerpt per chunk", () => {
    const start = TEXT.indexOf("salt.");
    const end = TEXT.indexOf("Beta") + 4;
    const planned = planFocusedChunks(chunkSourceTextWithOffsets(TEXT, 40), [{ start, end }]);

    expect(planned.map((entry) => entry.index)).toEqual([0, 1]);
    expect(focusExcerpts(planned[0]?.chunk ?? "", planned[0]?.focus ?? [])).toEqual(["salt."]);
    expect(focusExcerpts(planned[1]?.chunk ?? "", planned[1]?.focus ?? [])).toEqual(["Beta"]);
  });

  it("should ignore a mark that covers only whitespace between paragraphs", () => {
    const start = PARAGRAPHS[0]?.length ?? 0;
    const chunks = chunkSourceTextWithOffsets(TEXT, 3000);

    expect(markedRangesInChunk(chunks[0] ?? { text: "", segments: [] }, [{ start, end: start + 2 }])).toEqual([]);
  });
});

describe("quoteOverlapsFocus", () => {
  const chunk = "First claim about salt here. Second claim about pepper here.";
  const focus = [{ start: 29, end: 60 }];

  it("should accept a quote that sits inside a marked span", () => {
    expect(quoteOverlapsFocus("claim about pepper here", chunk, focus)).toBe(true);
  });

  it("should reject a quote taken from an unmarked part", () => {
    expect(quoteOverlapsFocus("First claim about salt", chunk, focus)).toBe(false);
  });

  it("should accept a quote that only partly overlaps a marked span", () => {
    expect(quoteOverlapsFocus("salt here. Second claim", chunk, focus)).toBe(true);
  });

  it("should accept any quote when nothing is marked", () => {
    expect(quoteOverlapsFocus("First claim about salt", chunk, [])).toBe(true);
  });

  it("should accept a quote repeated in the text when a later occurrence is marked", () => {
    const repeated = "The mitochondria makes energy. Filler sentence between. The mitochondria makes energy.";
    const start = repeated.lastIndexOf("The mitochondria");

    expect(quoteOverlapsFocus("The mitochondria makes energy.", repeated, [{ start, end: repeated.length }])).toBe(true);
  });

  it("should not let a tiny marked word match a longer re-worded quote", () => {
    expect(quoteOverlapsFocus("the cat sat down", "zzz cat zzz. other words here.", [{ start: 4, end: 7 }])).toBe(false);
  });
});
