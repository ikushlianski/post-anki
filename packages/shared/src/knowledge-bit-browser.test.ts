import { describe, expect, it } from "vitest";
import { knowledgeBitBrowserItemSchema, knowledgeBitBrowserQuerySchema } from "./knowledge-bit-browser";

describe("knowledgeBitBrowserQuerySchema", () => {
  it("should default to the first page of 50 when nothing is asked", () => {
    expect(knowledgeBitBrowserQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it("should refuse a page bigger than 100 pieces", () => {
    expect(knowledgeBitBrowserQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("knowledgeBitBrowserItemSchema", () => {
  it("should refuse a piece that has no phrasing to show", () => {
    const result = knowledgeBitBrowserItemSchema.safeParse({
      knowledgeBitId: "b1",
      phrasings: [],
      answer: "a",
      origin: "manual",
      addedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("knowledgeBitBrowserQuerySchema filters", () => {
  it("should carry clean filters next to the paging values", () => {
    expect(
      knowledgeBitBrowserQuerySchema.parse({ limit: "10", origins: "article", question: "cat", states: "zzz" }),
    ).toEqual({ limit: 10, offset: 0, origins: ["article"], question: "cat" });
  });
});
