import { describe, expect, it } from "vitest";
import { deriveChapterTitle } from "./derive-chapter-title";

describe("deriveChapterTitle", () => {
  it("strips a trailing hash and formats the chapter number", () => {
    expect(deriveChapterTitle("Chapter_1-Prompt_Chaining-a1b2c3d4e5f6.md")).toBe(
      "Chapter 1 — Prompt Chaining",
    );
  });

  it("strips a Google-Drive-style hash that itself contains hyphens", () => {
    expect(
      deriveChapterTitle(
        "Chapter_1-Prompt_Chaining-1flxKGrbnF2g8yh3F-oVD5Xx7ZumId56HbFpIiPdkqLI.md",
      ),
    ).toBe("Chapter 1 — Prompt Chaining");
  });

  it("keeps a genuine hyphenated compound word in the title while dropping the hash", () => {
    expect(
      deriveChapterTitle(
        "Chapter_7-Multi-Agent_Collaboration-1RZ5-2fykDQKOBx01pwfKkDe0GCs5ydca7xW9Q4wqS_M.md",
      ),
    ).toBe("Chapter 7 — Multi Agent Collaboration");
  });

  it("strips parentheses from an acronym-bearing title", () => {
    expect(
      deriveChapterTitle(
        "Chapter_10-Model_Context_Protocol_(MCP)-1e6XimYczKmhX9zpqEyxLFWPQgGuG0brp7Hic2sFl_qw.md",
      ),
    ).toBe("Chapter 10 — Model Context Protocol MCP");
  });

  it("handles a filename with no chapter number", () => {
    expect(deriveChapterTitle("Introduction.md")).toBe("Introduction");
  });

  it("handles a filename with no hash", () => {
    expect(deriveChapterTitle("Chapter_2-Routing.md")).toBe("Chapter 2 — Routing");
  });

  it("handles a filename with neither a hash nor a chapter number", () => {
    expect(deriveChapterTitle("Dedication.md")).toBe("Dedication");
  });

  it("handles a chapter number with no title text", () => {
    expect(deriveChapterTitle("Chapter_3.md")).toBe("Chapter 3");
  });
});
