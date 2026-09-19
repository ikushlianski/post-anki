import { describe, expect, it } from "vitest";
import { hashContent } from "./hash-content";

describe("hashContent", () => {
  it("produces the same hash for identical text", () => {
    expect(hashContent("What is a closure?")).toBe(hashContent("What is a closure?"));
  });

  it("produces a different hash for different text", () => {
    expect(hashContent("What is a closure?")).not.toBe(hashContent("What is a promise?"));
  });

  it("returns 16 hex characters", () => {
    expect(hashContent("anything")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hashes an empty string without throwing", () => {
    expect(() => hashContent("")).not.toThrow();
  });
});
