import { describe, expect, it } from "vitest";
import { resolveKnownSeriesParts } from "./resolve-known-series-parts";

describe("resolveKnownSeriesParts", () => {
  it("prefers discovered code-host chapters over sibling URLs when both are available", () => {
    const parts = resolveKnownSeriesParts({
      discoveredChapters: [
        { url: "https://github.com/owner/repo/blob/main/01-intro.md", title: "Chapter 1 — Intro" },
        { url: "https://github.com/owner/repo/blob/main/02-routing.md", title: "Chapter 2 — Routing" },
      ],
      siblingUrls: ["https://aws.example.com/guide-2", "https://aws.example.com/guide-3"],
      capturedUrl: "https://github.com/owner/repo/blob/main/01-intro.md",
      capturedTitle: "Something the classifier picked",
    });

    expect(parts).toEqual([
      { url: "https://github.com/owner/repo/blob/main/01-intro.md", title: "Chapter 1 — Intro" },
      { url: "https://github.com/owner/repo/blob/main/02-routing.md", title: "Chapter 2 — Routing" },
    ]);
  });

  it("builds parts from the captured URL plus its sibling URLs when no chapters were discovered", () => {
    const parts = resolveKnownSeriesParts({
      discoveredChapters: [],
      siblingUrls: [
        "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/threat-modeling.html",
        "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/data-protection.html",
      ],
      capturedUrl:
        "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/introduction.html",
      capturedTitle: null,
    });

    expect(parts).toEqual([
      {
        url: "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/introduction.html",
        title: "Agentic Ai Security",
      },
      {
        url: "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/threat-modeling.html",
        title: "Threat Modeling",
      },
      {
        url: "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/data-protection.html",
        title: "Data Protection",
      },
    ]);
  });

  it("keeps the classified title for the captured URL rather than re-deriving it", () => {
    const parts = resolveKnownSeriesParts({
      discoveredChapters: [],
      siblingUrls: ["https://aws.example.com/guide-2"],
      capturedUrl: "https://aws.example.com/guide-1",
      capturedTitle: "Security for agentic AI on AWS",
    });

    expect(parts[0]).toEqual({
      url: "https://aws.example.com/guide-1",
      title: "Security for agentic AI on AWS",
    });
  });

  it("numbers a colliding derived title instead of letting two parts share one, which slice generation joins by title", () => {
    const parts = resolveKnownSeriesParts({
      discoveredChapters: [],
      siblingUrls: [
        "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/index.html",
      ],
      capturedUrl:
        "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/introduction.html",
      capturedTitle: null,
    });

    const titles = parts.map((part) => part.title);

    expect(titles).toEqual(["Agentic Ai Security", "Agentic Ai Security (2)"]);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("numbers every repeat beyond the second when three or more parts collide", () => {
    const parts = resolveKnownSeriesParts({
      discoveredChapters: [],
      siblingUrls: [
        "https://example.com/a/guide/index.html",
        "https://example.com/b/guide/introduction.html",
      ],
      capturedUrl: "https://example.com/c/guide/index.html",
      capturedTitle: null,
    });

    expect(parts.map((part) => part.title)).toEqual(["Guide", "Guide (2)", "Guide (3)"]);
  });

  it("returns nothing when neither source has any parts", () => {
    expect(
      resolveKnownSeriesParts({
        discoveredChapters: [],
        siblingUrls: [],
        capturedUrl: "https://example.com/post",
        capturedTitle: "A single article",
      }),
    ).toEqual([]);
  });
});
