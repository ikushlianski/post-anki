import { describe, expect, it } from "vitest";
import { sliceWithoutSplittingPairs } from "./safe-slice.js";

describe("sliceWithoutSplittingPairs", () => {
  it("should drop an emoji that would be cut in half instead of leaving a broken character", () => {
    const text = `${"a".repeat(9)}😀tail`;
    const cut = sliceWithoutSplittingPairs(text, 10);

    expect(cut).toBe("a".repeat(9));
    expect(() => encodeURIComponent(cut)).not.toThrow();
  });

  it("should keep an emoji that fits entirely", () => {
    expect(sliceWithoutSplittingPairs(`${"a".repeat(8)}😀tail`, 10)).toBe(`${"a".repeat(8)}😀`);
  });

  it("should return a short text unchanged", () => {
    expect(sliceWithoutSplittingPairs("hi", 10)).toBe("hi");
  });
});
