import { describe, expect, it } from "vitest";
import { buildChatExportMarkdown, slugifySubjectName } from "./knowledge-bit-chat-queue-export.markdown.js";

describe("buildChatExportMarkdown", () => {
  it("should list each card with its background and the conversation in order", () => {
    const md = buildChatExportMarkdown("Rust", [
      {
        body: "Ownership moves on assignment",
        background: "From the book",
        messages: [
          { role: "user", text: "Why?" },
          { role: "assistant", text: "Because." },
        ],
      },
    ]);

    expect(md).toContain("# Chat conversations: Rust");
    expect(md).toContain("## 1. Ownership moves on assignment");
    expect(md).toContain("**Background**\n\n> From the book");
    expect(md.indexOf("**User**")).toBeLessThan(md.indexOf("**Assistant**"));
    expect(md).toContain("> Why?");
  });

  it("should say there is no conversation yet for a card nobody chatted about", () => {
    const md = buildChatExportMarkdown("Rust", [{ body: "A fact", background: null, messages: [] }]);

    expect(md).toContain("No conversation yet");
    expect(md).not.toContain("**Background**");
  });

  it("should keep multi-line and markdown-looking replies inside a blockquote unchanged", () => {
    const md = buildChatExportMarkdown("Rust", [
      {
        body: "Fact",
        background: null,
        messages: [{ role: "assistant", text: "# Not a heading\n\n```js\ncode\n```" }],
      },
    ]);

    expect(md).toContain("> # Not a heading\n>\n> ```js\n> code\n> ```");
  });

  it("should truncate a very long card title to one line", () => {
    const md = buildChatExportMarkdown("Rust", [{ body: `${"x".repeat(300)}\nsecond`, background: null, messages: [] }]);
    const title = md.split("\n").find((line) => line.startsWith("## 1."));

    expect(title?.length).toBeLessThan(120);
  });

  it("should state when the subject has no Chat cards", () => {
    expect(buildChatExportMarkdown("Rust", [])).toContain("No cards in Chat for this subject.");
  });
});

describe("slugifySubjectName", () => {
  it("should make a safe lowercase filename part", () => {
    expect(slugifySubjectName("  Café: Rust & Go! ")).toBe("cafe-rust-go");
  });

  it("should fall back when nothing usable remains", () => {
    expect(slugifySubjectName("???")).toBe("subject");
  });
});
