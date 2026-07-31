import { describe, expect, it } from "vitest";
import { buildSubjectContentText, hashSubjectContent, MAX_DESCRIPTION_CHARS } from "./content-hash";

describe("hashSubjectContent", () => {
  it("produces the same hash for identical name+description", () => {
    const a = hashSubjectContent("Webdev", "Programming — Web Development");
    const b = hashSubjectContent("Webdev", "Programming — Web Development");

    expect(a).toBe(b);
  });

  it("produces a different hash when the description changes", () => {
    const before = hashSubjectContent("Webdev", "Programming — Web Development");
    const after = hashSubjectContent("Webdev", "Programming — Web Development, updated");

    expect(before).not.toBe(after);
  });

  it("produces a different hash when the name changes", () => {
    const before = hashSubjectContent("Webdev", "same description");
    const after = hashSubjectContent("Web Development", "same description");

    expect(before).not.toBe(after);
  });

  it("treats an undefined description the same as an empty string", () => {
    const withUndefined = hashSubjectContent("Rust", undefined);
    const withEmpty = hashSubjectContent("Rust", "");

    expect(withUndefined).toBe(withEmpty);
  });

  it("truncates the description to MAX_DESCRIPTION_CHARS before hashing", () => {
    const long = "x".repeat(MAX_DESCRIPTION_CHARS + 500);
    const truncatedEquivalent = "x".repeat(MAX_DESCRIPTION_CHARS);

    expect(hashSubjectContent("Subject", long)).toBe(
      hashSubjectContent("Subject", truncatedEquivalent),
    );
  });
});

describe("buildSubjectContentText", () => {
  it("joins name and description with a newline", () => {
    expect(buildSubjectContentText("Webdev", "Programming")).toBe("Webdev\nProgramming");
  });

  it("treats an undefined description as empty", () => {
    expect(buildSubjectContentText("Rust", undefined)).toBe("Rust\n");
  });

  it("truncates a long description to MAX_DESCRIPTION_CHARS", () => {
    const long = "y".repeat(MAX_DESCRIPTION_CHARS + 100);
    const result = buildSubjectContentText("Subject", long);

    expect(result).toBe(`Subject\n${"y".repeat(MAX_DESCRIPTION_CHARS)}`);
  });
});
