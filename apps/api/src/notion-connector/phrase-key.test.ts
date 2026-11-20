import { describe, expect, it } from "vitest";
import { isImportable, phraseKey, type PhraseBlock } from "./phrase-key.js";

const bullet: PhraseBlock = { id: "b1", type: "bulleted_list_item", text: "break the ice", hasChildren: false };

describe("phraseKey", () => {
  it("should derive one stable key per Notion block so a re-run never files the same line twice", () => {
    expect(phraseKey("abc")).toBe("notion:abc");
  });
});

describe("isImportable", () => {
  it("should import a filled top-level bullet", () => {
    expect(isImportable(bullet)).toBe(true);
  });

  it("should skip an empty or whitespace-only bullet", () => {
    expect(isImportable({ ...bullet, text: "   " })).toBe(false);
  });

  it("should ignore toggles and other non-bullet blocks", () => {
    expect(isImportable({ ...bullet, type: "toggle" })).toBe(false);
    expect(isImportable({ ...bullet, type: "paragraph" })).toBe(false);
  });

  it("should leave a bullet with nested children alone so deleting it never trashes unseen content", () => {
    expect(isImportable({ ...bullet, hasChildren: true })).toBe(false);
  });
});
