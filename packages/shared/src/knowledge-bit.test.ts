import { describe, expect, it } from "vitest";
import {
  MANUAL_ITEM_BACK_MAX_CHARS,
  MANUAL_ITEM_EXAMPLE_MAX_CHARS,
  MANUAL_ITEM_FRONT_MAX_CHARS,
  createManualKnowledgeItemInput,
  triageKnowledgeBitInput,
  undoTriageKnowledgeBitInput,
} from "./knowledge-bit.js";

describe("createManualKnowledgeItemInput", () => {
  it("should trim front, back and example before storing them", () => {
    expect(
      createManualKnowledgeItemInput.parse({ front: "  Q  ", back: "\tA\n", example: " ex " }),
    ).toEqual({ front: "Q", back: "A", example: "ex", aiGenerated: false });
  });

  it("should reject a front or back that is empty or only whitespace", () => {
    expect(createManualKnowledgeItemInput.safeParse({ front: "   ", back: "A" }).success).toBe(false);
    expect(createManualKnowledgeItemInput.safeParse({ front: "Q", back: " \n " }).success).toBe(false);
    expect(createManualKnowledgeItemInput.safeParse({ back: "A" }).success).toBe(false);
  });

  it("should treat an empty or whitespace example as absent", () => {
    expect(createManualKnowledgeItemInput.parse({ front: "Q", back: "A", example: "" }).example).toBeUndefined();
    expect(createManualKnowledgeItemInput.parse({ front: "Q", back: "A", example: "  " }).example).toBeUndefined();
    expect(createManualKnowledgeItemInput.parse({ front: "Q", back: "A" }).example).toBeUndefined();
    expect(createManualKnowledgeItemInput.parse({ front: "Q", back: "A", example: null }).example).toBeUndefined();
  });

  it("should reject fields longer than their caps", () => {
    const front = "f".repeat(MANUAL_ITEM_FRONT_MAX_CHARS + 1);
    const back = "b".repeat(MANUAL_ITEM_BACK_MAX_CHARS + 1);
    const example = "e".repeat(MANUAL_ITEM_EXAMPLE_MAX_CHARS + 1);

    expect(createManualKnowledgeItemInput.safeParse({ front, back: "A" }).success).toBe(false);
    expect(createManualKnowledgeItemInput.safeParse({ front: "Q", back }).success).toBe(false);
    expect(createManualKnowledgeItemInput.safeParse({ front: "Q", back: "A", example }).success).toBe(false);
  });

  it("should keep the manual caps equal to the extraction caps for the same fields", () => {
    expect(MANUAL_ITEM_FRONT_MAX_CHARS).toBe(300);
    expect(MANUAL_ITEM_BACK_MAX_CHARS).toBe(600);
    expect(MANUAL_ITEM_EXAMPLE_MAX_CHARS).toBe(300);
  });
});

describe("createManualKnowledgeItemInput AI label and source links", () => {
  const base = { front: "Q", back: "A" };

  it("should treat an item as not AI generated when the flag is omitted", () => {
    expect(createManualKnowledgeItemInput.parse(base).aiGenerated).toBe(false);
  });

  it("should accept up to five http or https source links", () => {
    const sourceLinks = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`);

    expect(createManualKnowledgeItemInput.parse({ ...base, aiGenerated: true, sourceLinks }).sourceLinks).toEqual(sourceLinks);
  });

  it("should reject a sixth source link, a non-http link and an over-long link", () => {
    const six = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`);
    const long = `https://example.com/${"a".repeat(500)}`;

    expect(createManualKnowledgeItemInput.safeParse({ ...base, sourceLinks: six }).success).toBe(false);
    expect(createManualKnowledgeItemInput.safeParse({ ...base, sourceLinks: ["ftp://example.com/x"] }).success).toBe(false);
    expect(createManualKnowledgeItemInput.safeParse({ ...base, sourceLinks: ["javascript:alert(1)"] }).success).toBe(false);
    expect(createManualKnowledgeItemInput.safeParse({ ...base, sourceLinks: [long] }).success).toBe(false);
  });
});

describe("triageKnowledgeBitInput", () => {
  it("should accept one or two distinct variant ids to keep", () => {
    expect(triageKnowledgeBitInput.safeParse({ keepVariantIds: ["a"] }).success).toBe(true);
    expect(triageKnowledgeBitInput.safeParse({ keepVariantIds: ["a", "b"] }).success).toBe(true);
  });

  it("should reject keeping nothing, keeping three, or naming the same variant twice", () => {
    expect(triageKnowledgeBitInput.safeParse({ keepVariantIds: [] }).success).toBe(false);
    expect(triageKnowledgeBitInput.safeParse({ keepVariantIds: ["a", "b", "c"] }).success).toBe(false);
    expect(triageKnowledgeBitInput.safeParse({ keepVariantIds: ["a", "a"] }).success).toBe(false);
    expect(triageKnowledgeBitInput.safeParse({}).success).toBe(false);
  });
});

describe("undoTriageKnowledgeBitInput", () => {
  it("should accept one to twenty distinct variant ids to restore", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => `v${index}`);

    expect(undoTriageKnowledgeBitInput.safeParse({ restoreVariantIds: ["a"] }).success).toBe(true);
    expect(undoTriageKnowledgeBitInput.safeParse({ restoreVariantIds: twenty }).success).toBe(true);
  });

  it("should reject restoring nothing, more than twenty, duplicates, or empty ids", () => {
    const twentyOne = Array.from({ length: 21 }, (_, index) => `v${index}`);

    expect(undoTriageKnowledgeBitInput.safeParse({ restoreVariantIds: [] }).success).toBe(false);
    expect(undoTriageKnowledgeBitInput.safeParse({ restoreVariantIds: twentyOne }).success).toBe(false);
    expect(undoTriageKnowledgeBitInput.safeParse({ restoreVariantIds: ["a", "a"] }).success).toBe(false);
    expect(undoTriageKnowledgeBitInput.safeParse({ restoreVariantIds: [""] }).success).toBe(false);
    expect(undoTriageKnowledgeBitInput.safeParse({}).success).toBe(false);
  });
});
