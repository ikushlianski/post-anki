import { describe, it, expect } from "vitest";
import { knowledgeBitOriginSchema, knowledgeSourceProcessedResponse } from "./knowledge-bit-origin.js";

describe("knowledgeBitOriginSchema", () => {
  it("should accept only extracted and manual items", () => {
    expect(knowledgeBitOriginSchema.parse("extracted")).toBe("extracted");
    expect(knowledgeBitOriginSchema.parse("manual")).toBe("manual");
    expect(knowledgeBitOriginSchema.safeParse("imported").success).toBe(false);
    expect(knowledgeBitOriginSchema.safeParse("").success).toBe(false);
  });
});

describe("knowledgeSourceProcessedResponse", () => {
  it("should allow an open entry to report no processed time", () => {
    expect(knowledgeSourceProcessedResponse.parse({ id: "e1", processedAt: null }).processedAt).toBeNull();
    expect(knowledgeSourceProcessedResponse.safeParse({ id: "e1" }).success).toBe(false);
  });
});
