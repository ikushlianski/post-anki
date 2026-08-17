import { describe, expect, it } from "vitest";
import { buildSourceContentText, hashSourceContent, MAX_SOURCE_CONTENT_CHARS } from "./content-hash";

describe("hashSourceContent", () => {
  it("produces the same hash for identical title+fetchedText", () => {
    const a = hashSourceContent("An Article", "the body text");
    const b = hashSourceContent("An Article", "the body text");

    expect(a).toBe(b);
  });

  it("produces a different hash when the fetched text changes", () => {
    const before = hashSourceContent("An Article", "the body text");
    const after = hashSourceContent("An Article", "the body text, updated");

    expect(before).not.toBe(after);
  });

  it("produces a different hash when the title changes", () => {
    const before = hashSourceContent("Title A", "same body");
    const after = hashSourceContent("Title B", "same body");

    expect(before).not.toBe(after);
  });

  it("treats a null title and a null fetchedText the same as empty strings", () => {
    const withNull = hashSourceContent(null, null);
    const withEmpty = hashSourceContent("", "");

    expect(withNull).toBe(withEmpty);
  });

  it("truncates fetchedText to MAX_SOURCE_CONTENT_CHARS before hashing", () => {
    const long = "x".repeat(MAX_SOURCE_CONTENT_CHARS + 500);
    const truncatedEquivalent = "x".repeat(MAX_SOURCE_CONTENT_CHARS);

    expect(hashSourceContent("Title", long)).toBe(hashSourceContent("Title", truncatedEquivalent));
  });
});

describe("buildSourceContentText", () => {
  it("joins title and fetchedText with a newline", () => {
    expect(buildSourceContentText("An Article", "the body")).toBe("An Article\nthe body");
  });

  it("treats a null title and null fetchedText as empty", () => {
    expect(buildSourceContentText(null, null)).toBe("\n");
  });

  it("truncates long fetchedText to MAX_SOURCE_CONTENT_CHARS", () => {
    const long = "y".repeat(MAX_SOURCE_CONTENT_CHARS + 100);
    const result = buildSourceContentText("Title", long);

    expect(result).toBe(`Title\n${"y".repeat(MAX_SOURCE_CONTENT_CHARS)}`);
  });
});
