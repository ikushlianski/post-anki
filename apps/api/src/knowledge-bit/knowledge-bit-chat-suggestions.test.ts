import { describe, expect, it } from "vitest";
import { extractRelatedCards } from "./knowledge-bit-chat-suggestions.js";

const URL_A = "https://example.com/a";

function block(items: unknown): string {
  return `<related-cards>${JSON.stringify(items)}</related-cards>`;
}

const own = { front: "Q", back: "A", origin: "own", sources: [] };
const web = { front: "WQ", back: "WA", origin: "web", sources: [URL_A] };

describe("extractRelatedCards", () => {
  it("should strip the tag block from the reply shown to the learner", () => {
    const result = extractRelatedCards(`Answer.\n${block([own])}`, [], 0);

    expect(result.reply).toBe("Answer.");
    expect(result.suggestions).toEqual([own]);
  });

  it("should offer at most three suggestions", () => {
    const result = extractRelatedCards(block([own, own, own, own, own]), [], 0);

    expect(result.suggestions).toHaveLength(3);
  });

  it("should offer no suggestions and keep the reply when the JSON is invalid", () => {
    const result = extractRelatedCards("Answer.\n<related-cards>not json</related-cards>", [], 0);

    expect(result).toEqual({ reply: "Answer." });
  });

  it("should drop invalid items but keep valid ones", () => {
    const result = extractRelatedCards(block([{ front: "", back: "x", origin: "own", sources: [] }, own]), [], 0);

    expect(result.suggestions).toEqual([own]);
  });

  it("should not offer a web-labelled card when no search ran", () => {
    expect(extractRelatedCards(block([web]), [URL_A], 0).suggestions).toBeUndefined();
  });

  it("should remove urls the search never returned and unsafe ones", () => {
    const item = { ...web, sources: [URL_A, "https://invented.example.org/x", "http://localhost/x"] };

    const result = extractRelatedCards(block([item]), [URL_A], 1);

    expect(result.suggestions?.[0]?.sources).toEqual([URL_A]);
  });

  it("should drop a web card that is left without any cited source", () => {
    const item = { ...web, sources: ["https://invented.example.org/x"] };

    expect(extractRelatedCards(block([item]), [URL_A], 1).suggestions).toBeUndefined();
  });

  it("should strip an unclosed block at the end of the final paragraph", () => {
    const result = extractRelatedCards('Answer.\n<related-cards>[{"front":"Q"', [], 0);

    expect(result).toEqual({ reply: "Answer." });
  });

  it("should keep the whole answer when an earlier paragraph merely mentions the tag", () => {
    const text = "Use the <related-cards> tag for cards.\n\nSecond paragraph of the answer.";

    expect(extractRelatedCards(text, [], 0).reply).toBe(text);
  });
});
