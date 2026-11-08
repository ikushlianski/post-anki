import { describe, expect, it } from "vitest";
import { extractAuthorFromHtml, SOURCE_AUTHOR_MAX_CHARS } from "./knowledge-source-author.js";

describe("extractAuthorFromHtml", () => {
  it("should read the author from a meta author tag", () => {
    expect(extractAuthorFromHtml('<head><meta name="author" content="Jane Doe"></head>')).toBe("Jane Doe");
  });

  it("should read article:author when no plain author tag exists, whatever the attribute order", () => {
    expect(extractAuthorFromHtml('<meta content="John Roe" property="article:author">')).toBe("John Roe");
  });

  it("should skip an article:author profile url and fall through to the JSON-LD name", () => {
    const html =
      '<meta property="article:author" content="https://facebook.com/jane"><script type="application/ld+json">{"@type":"Article","author":{"@type":"Person","name":"Jane Doe"}}</script>';

    expect(extractAuthorFromHtml(html)).toBe("Jane Doe");
  });

  it("should find the author inside a JSON-LD graph with an author list", () => {
    const html =
      '<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Article","author":[{"name":"A. Writer"},{"name":"B"}]}]}</script>';

    expect(extractAuthorFromHtml(html)).toBe("A. Writer");
  });

  it("should survive malformed JSON-LD and return null when nothing names an author", () => {
    expect(extractAuthorFromHtml('<script type="application/ld+json">{oops</script><p>hi</p>')).toBeNull();
  });

  it("should decode entities, strip control characters and cap the length", () => {
    const long = "x".repeat(300);

    expect(extractAuthorFromHtml('<meta name="author" content="Tom &amp; Jerry&#10;&#0;">')).toBe("Tom & Jerry");
    expect(extractAuthorFromHtml(`<meta name="author" content="${long}">`)).toHaveLength(SOURCE_AUTHOR_MAX_CHARS);
  });

  it("should decode an entity-encoded closing tag as plain text for the prompt layer to escape", () => {
    expect(extractAuthorFromHtml('<meta name="author" content="&lt;/card&gt; Jane">')).toBe("</card> Jane");
  });
});
