import { describe, expect, it } from "vitest";

import { fencedCodeBlocks } from "./fenced-code";
import { importedFactText } from "./cloze-fact-text";
import { attentionFirstWords } from "./extraction-failure";

const CODE = "```py\ndef f():\n\n\n\n    return 1\n```";

describe("importedFactText with code", () => {
  it("should keep blank lines and indentation inside a fenced block", () => {
    expect(importedFactText(`Intro\n\n\n\n${CODE}\n\n\n\nEnd`)).toBe(`Intro\n\n${CODE}\n\nEnd`);
  });
});

describe("attentionFirstWords with code", () => {
  it("should show prose and mark the code instead of flattening it into the title", () => {
    expect(attentionFirstWords(`How f works\n${CODE}`)).toBe("How f works [code]");
  });

  it("should title a code-only note by its first code line", () => {
    expect(attentionFirstWords(CODE)).toBe("Code: def f():");
  });

  it("should leave prose titles as before", () => {
    expect(attentionFirstWords("  plain   words ")).toBe("plain words");
  });
});

describe("fence matching edge cases", () => {
  it("should match CRLF blocks", () => {
    expect(fencedCodeBlocks("a\r\n```py\r\nx = 1\r\n```\r\nb")).toHaveLength(1);
  });

  it("should treat an unclosed fence as running to the end", () => {
    expect(fencedCodeBlocks("a\n```py\nx = 1\ny = 2")).toEqual(["```py\nx = 1\ny = 2"]);
  });

  it("should match an empty fenced block", () => {
    expect(fencedCodeBlocks("a\n```\n```\nb")).toEqual(["```\n```"]);
  });
});
