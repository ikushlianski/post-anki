import { describe, expect, it } from "vitest";
import type { CardBrowserRow } from "@post-anki/shared";
import { filterCardBrowserRows } from "./filter-card-browser-rows.js";

function row(overrides: Partial<CardBrowserRow> = {}): CardBrowserRow {
  return {
    variantId: "variant_1",
    cardId: "card_1",
    concept: "Closures",
    prompt: "What is a closure?",
    answer: "A function bundled with its lexical scope.",
    topicId: "topic_1",
    topicTitle: "JavaScript fundamentals",
    ...overrides,
  };
}

describe("filterCardBrowserRows", () => {
  it("returns every row unfiltered for an empty query", () => {
    const rows = [row(), row({ variantId: "variant_2" })];

    expect(filterCardBrowserRows(rows, "")).toEqual(rows);
  });

  it("returns every row unfiltered for a whitespace-only query", () => {
    const rows = [row()];

    expect(filterCardBrowserRows(rows, "   ")).toEqual(rows);
  });

  it("matches a query found in the question text, case-insensitively", () => {
    const rows = [row({ prompt: "What is Hoisting?" })];

    expect(filterCardBrowserRows(rows, "hoisting")).toEqual(rows);
  });

  it("matches a query found in the answer text", () => {
    const rows = [row({ answer: "Declarations move to the top of scope." })];

    expect(filterCardBrowserRows(rows, "top of scope")).toEqual(rows);
  });

  it("matches a query found in the concept text", () => {
    const rows = [row({ concept: "Event loop" })];

    expect(filterCardBrowserRows(rows, "event loop")).toEqual(rows);
  });

  it("matches a query found in the owning topic's title", () => {
    const rows = [row({ topicTitle: "Async patterns" })];

    expect(filterCardBrowserRows(rows, "async")).toEqual(rows);
  });

  it("excludes a row matching none of question, answer, concept, or topic", () => {
    const matching = row({ prompt: "What is a promise?" });
    const nonMatching = row({
      variantId: "variant_2",
      prompt: "What is a closure?",
      answer: "A bundled scope.",
      concept: "Closures",
      topicTitle: "Scoping",
    });

    expect(filterCardBrowserRows([matching, nonMatching], "promise")).toEqual([matching]);
  });
});
