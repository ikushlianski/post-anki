import { describe, expect, it } from "vitest";
import { MAX_SOURCE_TEXT_CHARS, highlightsForStoredText, withPageTitleKeepingText } from "./knowledge-source-page-context.js";

describe("withPageTitleKeepingText", () => {
  it("should prefix the page title when the whole part still fits", () => {
    expect(withPageTitleKeepingText("body", "My Page")).toBe("Page: My Page\nbody");
  });

  it("should drop the prefix instead of cutting the end of a part that is near the size limit", () => {
    const text = "x".repeat(MAX_SOURCE_TEXT_CHARS - 3);

    expect(withPageTitleKeepingText(text, "My Page")).toBe(text);
  });

  it("should return the text unchanged when there is no title", () => {
    expect(withPageTitleKeepingText("body", "  ")).toBe("body");
  });
});

describe("highlightsForStoredText", () => {
  it("should leave marks untouched when no title line is added", () => {
    expect(highlightsForStoredText([{ start: 2, end: 5 }], undefined, 20)).toEqual([{ start: 2, end: 5 }]);
  });

  it("should shift marks past the title line", () => {
    expect(highlightsForStoredText([{ start: 0, end: 3 }], "Doc", 30)).toEqual([{ start: 10, end: 13 }]);
  });

  it("should drop marks cut off by the stored length", () => {
    expect(highlightsForStoredText([{ start: 0, end: 3 }, { start: 8, end: 12 }], undefined, 10)).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 10 },
    ]);
  });
});
