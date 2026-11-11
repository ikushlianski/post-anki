import { describe, expect, it } from "vitest";
import { cardTextKey } from "./knowledge-bit-card-text-key.js";

describe("cardTextKey", () => {
  it("should treat the same question and answer as one card despite case, spacing and punctuation", () => {
    expect(cardTextKey("What is  a Phrase?", "A group of words.")).toBe(
      cardTextKey("what is a phrase", "a group of words"),
    );
  });

  it("should tell cards apart when only the question differs", () => {
    expect(cardTextKey("Why do we sleep?", "To rest")).not.toBe(cardTextKey("When do we sleep?", "To rest"));
  });

  it("should ignore cloze markup so a sentence matches its rendered form", () => {
    expect(cardTextKey("The sky is {{c1::blue::colour}}", "blue")).toBe(cardTextKey("The sky is blue", "blue"));
  });
});
