import { describe, expect, it } from "vitest";
import { discoverBookChapters, MAX_DISCOVERED_CHAPTERS } from "./discover-book-chapters";
import type { GithubTreeEntry } from "./github-tree-schema";

function entry(path: string, type = "blob"): GithubTreeEntry {
  return { path, type };
}

describe("discoverBookChapters", () => {
  it("filters to markdown chapter files, orders them by path and derives titles", () => {
    const result = discoverBookChapters({
      owner: "Mathews-Tom",
      repo: "Agentic-Design-Patterns",
      ref: "main",
      truncated: false,
      entries: [
        entry("01-Part_One", "tree"),
        entry("01-Part_One/Chapter_2-Routing-hash2.md"),
        entry("README.md"),
        entry("01-Part_One/Chapter_1-Prompt_Chaining-1flxKGrbnF2g8yh3F-oVD5Xx7Zum.md"),
        entry(".github/ISSUE_TEMPLATE.md"),
        entry("01-Part_One/cover.png"),
        entry("00-Introduction/05-Introduction-hash5.md"),
      ],
    });

    expect(result.truncated).toBe(false);
    expect(result.capped).toBe(false);
    expect(result.chapters).toEqual([
      {
        path: "00-Introduction/05-Introduction-hash5.md",
        title: "05 Introduction",
        url: "https://github.com/Mathews-Tom/Agentic-Design-Patterns/blob/main/00-Introduction/05-Introduction-hash5.md",
      },
      {
        path: "01-Part_One/Chapter_1-Prompt_Chaining-1flxKGrbnF2g8yh3F-oVD5Xx7Zum.md",
        title: "Chapter 1 — Prompt Chaining",
        url: "https://github.com/Mathews-Tom/Agentic-Design-Patterns/blob/main/01-Part_One/Chapter_1-Prompt_Chaining-1flxKGrbnF2g8yh3F-oVD5Xx7Zum.md",
      },
      {
        path: "01-Part_One/Chapter_2-Routing-hash2.md",
        title: "Chapter 2 — Routing",
        url: "https://github.com/Mathews-Tom/Agentic-Design-Patterns/blob/main/01-Part_One/Chapter_2-Routing-hash2.md",
      },
    ]);
  });

  it("passes through a truncated tree as a partial result rather than dropping everything", () => {
    const result = discoverBookChapters({
      owner: "owner",
      repo: "repo",
      ref: "main",
      truncated: true,
      entries: [entry("Chapter_1-Intro-hash.md")],
    });

    expect(result.truncated).toBe(true);
    expect(result.chapters).toHaveLength(1);
  });

  it("caps the discovered chapter list and reports that it capped", () => {
    const entries = Array.from({ length: MAX_DISCOVERED_CHAPTERS + 5 }, (_, index) =>
      entry(`Chapter_${index + 1}-Topic-hash${index}.md`),
    );

    const result = discoverBookChapters({
      owner: "owner",
      repo: "repo",
      ref: "main",
      truncated: false,
      entries,
    });

    expect(result.capped).toBe(true);
    expect(result.chapters).toHaveLength(MAX_DISCOVERED_CHAPTERS);
    expect(result.chapters[0]!.title).toBe("Chapter 1 — Topic");
  });

  it("returns no chapters when the tree has no markdown files", () => {
    const result = discoverBookChapters({
      owner: "owner",
      repo: "repo",
      ref: "main",
      truncated: false,
      entries: [entry("src/index.ts"), entry("package.json")],
    });

    expect(result.chapters).toEqual([]);
    expect(result.capped).toBe(false);
  });
});
