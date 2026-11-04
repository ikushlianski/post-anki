import { describe, expect, it } from "vitest";
import { richTextToPlain } from "./rich-text-to-plain.js";

describe("richTextToPlain", () => {
  it("should join formatted segments into one continuous string", () => {
    expect(richTextToPlain([{ plain_text: "Closures " }, { plain_text: "capture" }, { plain_text: " scope" }])).toBe(
      "Closures capture scope",
    );
  });

  it("should return an empty string when the block has no rich text", () => {
    expect(richTextToPlain(undefined)).toBe("");
    expect(richTextToPlain([])).toBe("");
  });

  it("should ignore segments without text instead of printing undefined", () => {
    expect(richTextToPlain([{ plain_text: "a" }, {}, { plain_text: "b" }])).toBe("ab");
  });
});
