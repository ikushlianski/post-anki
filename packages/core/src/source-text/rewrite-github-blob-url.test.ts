import { describe, expect, it } from "vitest";
import { rewriteGithubBlobUrl } from "./rewrite-github-blob-url";

describe("rewriteGithubBlobUrl", () => {
  it("rewrites a blob URL to the raw markdown URL", () => {
    const blobUrl =
      "https://github.com/Mathews-Tom/Agentic-Design-Patterns/blob/main/01-Part_One/Chapter_1-Prompt_Chaining.md";

    expect(rewriteGithubBlobUrl(blobUrl)).toBe(
      "https://raw.githubusercontent.com/Mathews-Tom/Agentic-Design-Patterns/main/01-Part_One/Chapter_1-Prompt_Chaining.md",
    );
  });

  it("drops a query string on the blob URL", () => {
    const blobUrl = "https://github.com/owner/repo/blob/main/README.md?plain=1";

    expect(rewriteGithubBlobUrl(blobUrl)).toBe(
      "https://raw.githubusercontent.com/owner/repo/main/README.md",
    );
  });

  it("drops a line-range fragment on the blob URL", () => {
    const blobUrl = "https://github.com/owner/repo/blob/main/README.md#L10-L20";

    expect(rewriteGithubBlobUrl(blobUrl)).toBe(
      "https://raw.githubusercontent.com/owner/repo/main/README.md",
    );
  });

  it("leaves an already-raw URL alone", () => {
    const rawUrl = "https://raw.githubusercontent.com/owner/repo/main/README.md";

    expect(rewriteGithubBlobUrl(rawUrl)).toBe(rawUrl);
  });

  it("leaves a non-GitHub URL alone", () => {
    const url = "https://docs.aws.amazon.com/prescriptive-guidance/latest/intro.html";

    expect(rewriteGithubBlobUrl(url)).toBe(url);
  });

  it("leaves a GitHub URL that is not a blob alone", () => {
    expect(rewriteGithubBlobUrl("https://github.com/owner/repo/tree/main/src")).toBe(
      "https://github.com/owner/repo/tree/main/src",
    );
    expect(rewriteGithubBlobUrl("https://github.com/owner/repo")).toBe(
      "https://github.com/owner/repo",
    );
    expect(rewriteGithubBlobUrl("https://github.com/owner/repo/issues/42")).toBe(
      "https://github.com/owner/repo/issues/42",
    );
  });

  it("leaves a malformed URL alone rather than throwing", () => {
    expect(rewriteGithubBlobUrl("not a url")).toBe("not a url");
  });
});
