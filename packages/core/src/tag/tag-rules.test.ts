import { describe, it, expect } from "vitest";
import { normalizeTagName } from "./tag-rules";

describe("normalizeTagName", () => {
  it("lowercases the name so casing differences don't create duplicate tags", () => {
    expect(normalizeTagName("Performance")).toBe("performance");
    expect(normalizeTagName("performance")).toBe("performance");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTagName("  Performance  ")).toBe("performance");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeTagName("Core   Web  Vitals")).toBe("core web vitals");
  });

  it("treats tabs and newlines the same as spaces", () => {
    expect(normalizeTagName("Node.js\tEvent\nLoop")).toBe("node.js event loop");
  });

  it("produces the same normalized form for names that should collide, per SCENARIO 13", () => {
    expect(normalizeTagName("Performance")).toBe(normalizeTagName("performance"));
    expect(normalizeTagName(" Performance ")).toBe(normalizeTagName("performance"));
  });
});
