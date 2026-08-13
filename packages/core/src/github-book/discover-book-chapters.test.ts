import { describe, expect, it } from "vitest";
import { AGENTIC_DESIGN_PATTERNS_PATHS } from "./agentic-design-patterns-fixture";
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
        title: "Introduction",
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

  it("discovers the real Agentic-Design-Patterns book in reading order, uncapped, with no bare-number titles", () => {
    const result = discoverBookChapters({
      owner: "Mathews-Tom",
      repo: "Agentic-Design-Patterns",
      ref: "main",
      truncated: false,
      entries: AGENTIC_DESIGN_PATTERNS_PATHS.map((path) => entry(path)),
    });

    expect(result.capped).toBe(false);

    const titles = result.chapters.map((chapter) => chapter.title);

    expect(titles).not.toContain("");
    for (const title of titles) {
      expect(title).not.toMatch(/^\d+$/);
    }

    const chapter8Index = result.chapters.findIndex((chapter) => chapter.title === "Chapter 8 — Memory Management");
    const chapter10Index = result.chapters.findIndex(
      (chapter) => chapter.title === "Chapter 10 — Model Context Protocol MCP",
    );

    expect(chapter8Index).toBeGreaterThanOrEqual(0);
    expect(chapter10Index).toBeGreaterThan(chapter8Index);

    expect(titles).toEqual([
      "A Thought Leaders Perspective Power and Responsibility",
      "Introduction",
      "What makes an AI system an Agent",
      "Chapter 1 — Prompt Chaining",
      "Chapter 2 — Routing",
      "Chapter 3 — Parallelization",
      "Chapter 4 — Reflection",
      "Chapter 5 — Tool Use Function Calling",
      "Chapter 6 — Planning",
      "Chapter 7 — Multi Agent Collaboration",
      "Chapter 8 — Memory Management",
      "Chapter 9 — Learning and Adaptation",
      "Chapter 10 — Model Context Protocol MCP",
      "Chapter 11 — Goal Setting and Monitoring",
      "Chapter 12 — Exception Handling and Recovery",
      "Chapter 13 — Human in the Loop",
      "Chapter 14 — Knowledge Retrieval RAG",
      "Chapter 15 — Inter Agent Communication A2A",
      "Chapter 16 — Resource Aware Optimization",
      "Chapter 17 — Reasoning Techniques",
      "Chapter 18 — Guardrails Safety Patterns",
      "Chapter 19 — Evaluation and Monitoring",
      "Chapter 20 — Prioritization",
      "Chapter 21 — Exploration and Discovery",
      "Appendix A — Advanced Prompting Techniques",
      "Appendix B — AI Agentic Interactions From GUI to Real World Environment",
      "Appendix C — Quick Overview of Agentic Frameworks",
      "Appendix D — Building an Agent with AgentSpace on line only",
      "Appendix E — AI Agents on the CLI",
      "Appendix F — Under the Hood An Inside Look at the Agents Reasoning Engines",
      "Appendix G — Coding Agents",
      "Conclusion",
      "Online Contribution Frequently Asked Questions Agentic Design Patterns",
    ]);

    expect(result.chapters.map((chapter) => chapter.path)).not.toContain(
      "00-Introduction/01-Dedication-1cQ61mNpiWn6eSORmWjEjF44vN2Lpba8kyKmNwIC60ig.md",
    );
    expect(result.chapters.map((chapter) => chapter.path)).not.toContain(
      "00-Introduction/02-Acknowledgment-1u2y6tY48bw8nriDUuwWEf9s8g66vyIqBKSKZDOS-n0s.md",
    );
    expect(result.chapters.map((chapter) => chapter.path)).not.toContain(
      "00-Introduction/03-Foreword-18Q9kfZuCTL37ztrSjLxwf8Elr5UfAiAavmnj0IqSpbU.md",
    );
    expect(result.chapters.map((chapter) => chapter.path)).not.toContain("README.md");
  });
});
