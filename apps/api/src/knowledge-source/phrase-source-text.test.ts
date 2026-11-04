import { describe, expect, it } from "vitest";
import { formatPhraseSourceText, parsePhraseSourceText } from "./phrase-source-text.js";

describe("phrase source text", () => {
  it("should give back the same phrase and hint that were stored", () => {
    const text = formatPhraseSourceText("touch base", "выйти на связь");

    expect(parsePhraseSourceText(text)).toEqual({
      phrase: "touch base",
      hint: "выйти на связь",
      unsure: false,
    });
  });

  it("should round-trip a phrase that has no hint", () => {
    expect(parsePhraseSourceText(formatPhraseSourceText("circle back", null))).toEqual({
      phrase: "circle back",
      hint: null,
      unsure: false,
    });
  });

  it("should keep the unsure mark so a doubtful phrase is still flagged later", () => {
    const text = formatPhraseSourceText("wrap it up", "done", true);

    expect(parsePhraseSourceText(text)).toEqual({ phrase: "wrap it up", hint: "done", unsure: true });
  });

  it("should refuse text that was not stored as a phrase source", () => {
    expect(parsePhraseSourceText("some prose")).toBeNull();
  });
});
