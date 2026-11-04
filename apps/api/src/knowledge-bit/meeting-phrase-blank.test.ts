import { describe, expect, it } from "vitest";
import { blankPhrase, revealsPhrase } from "./meeting-phrase-blank.js";

describe("blankPhrase", () => {
  it("should replace the phrase with one blank and keep the rest of the sentence", () => {
    expect(blankPhrase("Let's touch base on Friday.", "touch base")).toBe("Let's ____ on Friday.");
  });

  it("should find the phrase regardless of case", () => {
    expect(blankPhrase("Touch base soon, ok?", "touch base")).toBe("____ soon, ok?");
  });

  it("should drop a sentence where the phrase cannot be found", () => {
    expect(blankPhrase("Let's make contact later.", "touch base")).toBeNull();
  });

  it("should drop a sentence where the phrase appears twice so no copy of the answer stays visible", () => {
    expect(blankPhrase("Touch base now, then touch base again.", "touch base")).toBeNull();
  });

  it("should not blank part of a longer word", () => {
    expect(blankPhrase("The database is down.", "base")).toBeNull();
  });

  it("should return nothing for a phrase with no words", () => {
    expect(blankPhrase("Anything.", "???")).toBeNull();
  });
});

describe("blankPhrase with visible words", () => {
  const sentence = "The vendor said it was approved last quarter, or so we heard.";

  it("should keep the leading words and blank each hidden word", () => {
    expect(blankPhrase(sentence, "or so we heard", 1)).toBe(
      "The vendor said it was approved last quarter, or ____ ____ ____.",
    );
  });

  it("should hide more words as the parameter shrinks", () => {
    expect(blankPhrase(sentence, "or so we heard", 2)).toBe(
      "The vendor said it was approved last quarter, or so ____ ____.",
    );
    expect(blankPhrase(sentence, "or so we heard", 0)).toBe(
      "The vendor said it was approved last quarter, ____.",
    );
  });

  it("should always hide at least the last word", () => {
    expect(blankPhrase(sentence, "or so we heard", 9)).toBe(
      "The vendor said it was approved last quarter, or so we ____.",
    );
  });
});

describe("revealsPhrase", () => {
  it("should flag a front that contains the phrase", () => {
    expect(revealsPhrase("We should touch base", "touch base")).toBe(true);
  });

  it("should flag a front that contains a key word of the phrase", () => {
    expect(revealsPhrase("It is about touching things", "touch base")).toBe(true);
  });

  it("should accept a front that avoids the phrase and its key words", () => {
    expect(revealsPhrase("Связаться и коротко обсудить", "touch base")).toBe(false);
    expect(revealsPhrase("to talk briefly with someone", "touch base")).toBe(false);
  });
});
