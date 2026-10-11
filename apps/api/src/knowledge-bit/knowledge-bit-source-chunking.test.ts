import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkSourceText } from "./knowledge-bit-source-chunking.js";

function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

describe("chunkSourceText", () => {
  it("should keep a short paste as a single chunk so the writer sees the whole source", () => {
    expect(chunkSourceText("One paragraph.\n\nAnother one.")).toEqual(["One paragraph.\n\nAnother one."]);
  });

  it("should return no chunks for a blank paste", () => {
    expect(chunkSourceText("  \n\n \n")).toEqual([]);
  });

  it("should pack whole paragraphs into chunks no larger than the limit", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `${i}`.repeat(100));
    const chunks = chunkSourceText(paragraphs.join("\n\n"), 250);

    expect(chunks).toEqual([
      `${paragraphs[0]}\n\n${paragraphs[1]}`,
      `${paragraphs[2]}\n\n${paragraphs[3]}`,
      `${paragraphs[4]}\n\n${paragraphs[5]}`,
    ]);
  });

  it("should split an oversize paragraph on sentence ends and lose no text", () => {
    const sentence = "Это одно довольно длинное предложение про продажи софта. ";
    const paragraph = sentence.repeat(20).trim();
    const chunks = chunkSourceText(paragraph, 300);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 300)).toBe(true);
    expect(chunks.every((chunk) => chunk.endsWith("софта."))).toBe(true);
    expect(squash(chunks.join(" "))).toBe(squash(paragraph));
  });

  it("should hard-split a single sentence longer than the limit", () => {
    const chunks = chunkSourceText("a".repeat(700), 300);

    expect(chunks.map((chunk) => chunk.length)).toEqual([300, 300, 100]);
  });

  it("should chunk a long Russian paste at 3000 characters without losing text", () => {
    const paragraph = readFileSync(
      new URL("./knowledge-bit-source-items.fixture.ru.txt", import.meta.url),
      "utf8",
    );
    const text = Array.from({ length: 12 }, () => paragraph.trim()).join("\n\n");
    const chunks = chunkSourceText(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 3000)).toBe(true);
    expect(squash(chunks.join("\n\n"))).toBe(squash(text));
  });
});
