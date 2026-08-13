import { describe, expect, it } from "vitest";
import { buildGithubBlobUrl, buildGithubTreeApiUrl, parseGithubBlobUrl } from "./parse-github-blob-url";

describe("parseGithubBlobUrl", () => {
  it("extracts owner, repo, ref and decoded path from a blob URL", () => {
    expect(
      parseGithubBlobUrl(
        "https://github.com/Mathews-Tom/Agentic-Design-Patterns/blob/main/01-Part_One/Chapter_1-Prompt_Chaining-abc123.md",
      ),
    ).toEqual({
      owner: "Mathews-Tom",
      repo: "Agentic-Design-Patterns",
      ref: "main",
      path: "01-Part_One/Chapter_1-Prompt_Chaining-abc123.md",
    });
  });

  it("decodes percent-encoded path segments so they match the raw Trees API path", () => {
    const parsed = parseGithubBlobUrl(
      "https://github.com/owner/repo/blob/main/Chapter_5-Tool_Use_%28Function_Calling%29-hash.md",
    );

    expect(parsed?.path).toBe("Chapter_5-Tool_Use_(Function_Calling)-hash.md");
  });

  it("returns null for a non-GitHub URL", () => {
    expect(parseGithubBlobUrl("https://example.com/some/article")).toBeNull();
  });

  it("returns null for a GitHub URL that is not a blob URL", () => {
    expect(parseGithubBlobUrl("https://github.com/owner/repo")).toBeNull();
    expect(parseGithubBlobUrl("https://github.com/owner/repo/tree/main/docs")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(parseGithubBlobUrl("not a url")).toBeNull();
  });
});

describe("buildGithubBlobUrl", () => {
  it("percent-encodes path segments that contain spaces", () => {
    expect(buildGithubBlobUrl("owner", "repo", "main", "Chapter 5-Tool Use.md")).toBe(
      "https://github.com/owner/repo/blob/main/Chapter%205-Tool%20Use.md",
    );
  });

  it("round-trips with parseGithubBlobUrl", () => {
    const path = "01-Part_One/Chapter_1-Prompt_Chaining-abc-def.md";
    const url = buildGithubBlobUrl("owner", "repo", "main", path);

    expect(parseGithubBlobUrl(url)?.path).toBe(path);
  });
});

describe("buildGithubTreeApiUrl", () => {
  it("builds the recursive Trees API URL for the given ref", () => {
    expect(buildGithubTreeApiUrl("owner", "repo", "main")).toBe(
      "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
    );
  });
});
