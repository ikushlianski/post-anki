import { describe, expect, it } from "vitest";
import { classifyNote, normalizeNote } from "./note-text.js";

describe("normalizeNote", () => {
  it("should treat a hand-imported line and the same Notion line as equal despite case, spacing, curly quotes and trailing punctuation", () => {
    expect(normalizeNote("  It’s  a Piece of Cake… ")).toBe(normalizeNote("it's a piece of cake"));
    expect(normalizeNote("Did you follow up?!")).toBe("did you follow up");
  });

  it("should keep different wording different", () => {
    expect(normalizeNote("circle back")).not.toBe(normalizeNote("circle back later"));
  });
});

describe("classifyNote", () => {
  it("should call a single token a word even with surrounding punctuation or a lone question mark", () => {
    expect(classifyNote("ubiquitous")).toBe("word");
    expect(classifyNote(" (ubiquitous)? ")).toBe("word");
    expect(classifyNote("ubiquitous (?)")).toBe("word");
  });

  it("should call two or more tokens a phrase", () => {
    expect(classifyNote("circle back")).toBe("phrase");
  });
});
