import { describe, expect, it } from "vitest";
import type { SocraticSessionSummary } from "@post-anki/shared";
import { formatSessionSummary } from "./session-summary-view.js";

function makeSummary(over: Partial<SocraticSessionSummary> = {}): SocraticSessionSummary {
  return {
    topicTitle: "TanStack Start",
    depth: "working",
    solidConcepts: ["Loaders", "Server functions"],
    mostRecentGap: null,
    gapsLoggedCount: 0,
    crossCuttingConcerns: [],
    exchangeCount: 3,
    topicMaturity: 40,
    ...over,
  };
}

describe("formatSessionSummary", () => {
  it("shows the topic title, real depth value, and solid understanding (AC 27, 31)", () => {
    const text = formatSessionSummary(makeSummary());

    expect(text).toContain("Session summary");
    expect(text).toContain("TanStack Start");
    expect(text).toContain("Depth: working");
    expect(text).toContain("Solid understanding: Loaders, Server functions");
  });

  it("renders the honest zero-gap fallback verbatim when no gap was logged (AC 29)", () => {
    const text = formatSessionSummary(makeSummary({ mostRecentGap: null, gapsLoggedCount: 0 }));

    expect(text).toContain("Solid session — no new gaps logged.");
  });

  it("renders the real depth enum value, never the issue's illustrative 'architect' label (AC 31)", () => {
    for (const depth of ["awareness", "working", "deep"] as const) {
      const text = formatSessionSummary(makeSummary({ depth }));

      expect(text).toContain(`Depth: ${depth}`);
      expect(text).not.toContain("architect");
    }
  });

  it("switches to the gap-shown branch once mostRecentGap is populated — dormant today, ready for a future story", () => {
    const text = formatSessionSummary(
      makeSummary({ mostRecentGap: { gapId: "g1", label: "Retries" }, gapsLoggedCount: 2 }),
    );

    expect(text).toContain("Gap (most recent): Retries");
    expect(text).toContain("Gaps logged: 2");
    expect(text).not.toContain("no new gaps logged");
  });
});
