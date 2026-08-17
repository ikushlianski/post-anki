import { describe, expect, it } from "vitest";
import { extractSourceText } from "./extract-source-text";
import {
  AWS_DOCS_PAGE_CHROME_STRINGS,
  AWS_DOCS_PAGE_FIXTURE,
} from "./fixtures/aws-docs-page";
import {
  GITHUB_BLOB_PAGE_CHROME_STRINGS,
  GITHUB_BLOB_PAGE_FIXTURE,
} from "./fixtures/github-blob-page";

describe("extractSourceText", () => {
  describe("an AWS docs page with a huge left-nav tree, breadcrumbs, and a cookie banner", () => {
    const result = extractSourceText(AWS_DOCS_PAGE_FIXTURE);

    it("keeps the article body, including a curly apostrophe and an em dash entity", () => {
      expect(result).toContain("Agentic AI workloads combine large language models");
      expect(result).toContain(
        "Why agentic workloads need a distinct security model",
      );
      expect(result).toContain("user’s behalf");
      expect(result).toContain("chatbot — prompt injection");
    });

    it("drops every piece of navigation and footer chrome", () => {
      for (const chrome of AWS_DOCS_PAGE_CHROME_STRINGS) {
        expect(result).not.toContain(chrome);
      }
    });

    it("is dramatically smaller than the raw page, since the nav tree dominates the byte count", () => {
      expect(result.length).toBeLessThan(AWS_DOCS_PAGE_FIXTURE.length * 0.5);
    });
  });

  describe("a GitHub blob page wrapped in the full app shell", () => {
    const result = extractSourceText(GITHUB_BLOB_PAGE_FIXTURE);

    it("keeps the rendered markdown body", () => {
      expect(result).toContain("Chapter 1: Prompt Chaining");
      expect(result).toContain("Prompt chaining breaks a complex task");
      expect(result).toContain("step1 -> step2 -> step3");
    });

    it("drops the header, repo nav, file tree, and footer chrome", () => {
      for (const chrome of GITHUB_BLOB_PAGE_CHROME_STRINGS) {
        expect(result).not.toContain(chrome);
      }
    });

    it("drops the inline copy-code svg icon nested inside the article itself", () => {
      expect(result).not.toContain("viewBox");
      expect(result).not.toContain("<path");
    });
  });

  describe("markdown or plain text with no HTML tags", () => {
    it("passes it through close to intact so headings survive", () => {
      const markdown = "# Chapter 1: Prompt Chaining\n\nSome body text here.";

      expect(extractSourceText(markdown)).toBe(markdown);
    });

    it("does not misfire on a markdown autolink", () => {
      const markdown = "See <https://example.com> for details.";

      expect(extractSourceText(markdown)).toBe(markdown);
    });

    it("trims surrounding whitespace", () => {
      expect(extractSourceText("  plain text  \n")).toBe("plain text");
    });
  });

  describe("HTML with neither <main> nor <article>", () => {
    it("falls back to the whole body, still stripping boilerplate", () => {
      const html = "<html><body><nav>menu</nav><div><p>only content</p></div></body></html>";

      expect(extractSourceText(html)).toBe("only content");
    });
  });

  describe("a page with no readable text", () => {
    it("returns an empty string rather than throwing", () => {
      expect(extractSourceText("<html><body></body></html>")).toBe("");
    });
  });
});
