import { describe, expect, it } from "vitest";
import { phraseSplitResponseSchema } from "./knowledge-bit-phrase-split";

describe("phraseSplitResponseSchema", () => {
  it("should accept a split result with the situation and front of each card", () => {
    const parsed = phraseSplitResponseSchema.parse({
      updated: 2,
      variants: [
        { id: "v1", prompt: "How do I ask for a delay?", context: "Formal call" },
        { id: "v2", prompt: "How do I ask for a delay?", context: null },
      ],
    });

    expect(parsed.updated).toBe(2);
    expect(parsed.variants).toHaveLength(2);
  });

  it("should accept a no-op result when nothing needed splitting", () => {
    expect(phraseSplitResponseSchema.safeParse({ updated: 0, variants: [] }).success).toBe(true);
  });

  it("should reject a negative or fractional updated count", () => {
    expect(phraseSplitResponseSchema.safeParse({ updated: -1, variants: [] }).success).toBe(false);
    expect(phraseSplitResponseSchema.safeParse({ updated: 1.5, variants: [] }).success).toBe(false);
  });

  it("should reject a variant without an id", () => {
    expect(
      phraseSplitResponseSchema.safeParse({ updated: 1, variants: [{ prompt: "p", context: null }] }).success,
    ).toBe(false);
  });
});
