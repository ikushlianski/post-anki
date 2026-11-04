import { describe, expect, it } from "vitest";
import { rollingPhraseFront, visibleWordsFor } from "./meeting-phrase-rolling-front.js";

const ANSWER = "get the ball rolling";
const PROMPT = "Let's ____ on this.\nНачать двигаться";

function front(reviewCount: number, overrides: Partial<Parameters<typeof rollingPhraseFront>[0]> = {}) {
  return rollingPhraseFront({ kind: "basic", prompt: PROMPT, answer: ANSWER, reviewCount, ...overrides });
}

describe("visibleWordsFor", () => {
  it("should show all but the last word of a long chunk on a new card and nothing after three reviews", () => {
    expect([0, 1, 2, 3, 9].map((count) => visibleWordsFor(4, count))).toEqual([3, 2, 1, 0, 0]);
  });

  it("should keep a two-word chunk fully blank from the start", () => {
    expect(visibleWordsFor(2, 0)).toBe(0);
  });
});

describe("rollingPhraseFront", () => {
  it("should show the first words of the chunk on a new card without any letter hint", () => {
    expect(front(0)).toBe("Let's get the ball ____ on this.\nНачать двигаться");
  });

  it("should hide one more word as the card is reviewed", () => {
    expect(front(1)).toBe("Let's get the ____ ____ on this.\nНачать двигаться");
  });

  it("should fully blank the chunk after three reviews and keep the meaning line", () => {
    expect(front(3)).toBe("Let's ____ on this.\nНачать двигаться");
  });

  it("should capitalise the first visible word when the chunk opens the sentence", () => {
    expect(front(0, { prompt: "____ on this, please.\nНачать двигаться" })).toBe(
      "Get the ball ____ on this, please.\nНачать двигаться",
    );
  });

  it("should leave a two-word chunk fully blank as stored", () => {
    expect(front(0, { answer: "touch base", prompt: "Let's ____ on Friday.\nСвязаться" })).toBeNull();
  });

  it("should leave cards that did not come from the phrase pipeline alone", () => {
    expect(front(0, { prompt: "What is a ball?" })).toBeNull();
    expect(front(0, { kind: "cloze" })).toBeNull();
    expect(front(0, { prompt: "Что такое мяч?\nКороткое" })).toBeNull();
  });

  it("should leave the stored front alone when it does not hold exactly one blank", () => {
    expect(front(0, { prompt: "Let's ____ and ____.\nНачать двигаться" })).toBeNull();
  });
});
