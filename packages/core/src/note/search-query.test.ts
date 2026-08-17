import { describe, it, expect } from "vitest";
import { normalizeSearchQuery } from "./search-query";

describe("normalizeSearchQuery", () => {
  it("trims surrounding whitespace from a real query", () => {
    expect(normalizeSearchQuery("  idempotency  ")).toBe("idempotency");
  });

  it("returns null for an empty string", () => {
    expect(normalizeSearchQuery("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(normalizeSearchQuery("   ")).toBeNull();
  });

  it("returns null for a tab/newline-only string", () => {
    expect(normalizeSearchQuery("\t\n")).toBeNull();
  });
});
