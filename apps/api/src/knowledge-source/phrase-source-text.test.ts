import { describe, expect, it } from "vitest";
import { formatPhraseSourceText, parseEnglishNote, parsePhraseSourceText } from "./phrase-source-text.js";

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

describe("parseEnglishNote", () => {
  it("should take a bare note as the phrase the learner did not know", () => {
    expect(parseEnglishNote("  circle back \n")).toEqual({ phrase: "circle back", hint: null, unsure: false });
  });

  it("should use the first line as the phrase and the rest as the hint", () => {
    expect(parseEnglishNote("circle back\nto return to a topic later")).toEqual({
      phrase: "circle back",
      hint: "to return to a topic later",
      unsure: false,
    });
  });

  it("should still read the stored phrase format", () => {
    expect(parseEnglishNote(formatPhraseSourceText("touch base", "связь", true))).toEqual({
      phrase: "touch base",
      hint: "связь",
      unsure: true,
    });
  });

  it("should return nothing for an empty note", () => {
    expect(parseEnglishNote("  \n ")).toBeNull();
  });
});
