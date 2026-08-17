import { describe, expect, it } from "vitest";
import { deriveTitleFromUrl } from "./derive-title-from-url";

describe("deriveTitleFromUrl", () => {
  it("de-slugifies and title-cases the last meaningful path segment", () => {
    expect(
      deriveTitleFromUrl(
        "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/threat-modeling.html",
      ),
    ).toBe("Threat Modeling");
  });

  it("drops the file extension", () => {
    expect(deriveTitleFromUrl("https://example.com/guides/identity-and-access.html")).toBe(
      "Identity And Access",
    );
  });

  it("steps back to the parent segment when the last segment is index/introduction filler", () => {
    expect(
      deriveTitleFromUrl(
        "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/introduction.html",
      ),
    ).toBe("Agentic Ai Security");
    expect(deriveTitleFromUrl("https://example.com/guides/networking/index.html")).toBe("Networking");
  });

  it("handles a trailing slash by using the last non-empty segment", () => {
    expect(deriveTitleFromUrl("https://example.com/guides/security/")).toBe("Security");
  });

  it("ignores a query string when finding the path segment", () => {
    expect(deriveTitleFromUrl("https://example.com/guides/security?ref=newsletter&utm=1")).toBe(
      "Security",
    );
  });

  it("steps back from an all-numeric segment to a more informative parent", () => {
    expect(deriveTitleFromUrl("https://example.com/docs/networking/42")).toBe("Networking");
  });

  it("falls back to the bare numeric segment when there is no parent to step back to", () => {
    expect(deriveTitleFromUrl("https://example.com/42")).toBe("42");
  });

  it("truncates a very long slug instead of returning an unbounded title", () => {
    const longSlug = Array.from({ length: 30 }, (_, i) => `word${i}`).join("-");
    const title = deriveTitleFromUrl(`https://example.com/guides/${longSlug}`);

    expect(title.length).toBeLessThanOrEqual(81);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to a placeholder for a URL with no usable path segment", () => {
    expect(deriveTitleFromUrl("https://example.com/")).toBe("Untitled");
    expect(deriveTitleFromUrl("https://example.com")).toBe("Untitled");
  });

  it("falls back to a placeholder for an unparseable URL", () => {
    expect(deriveTitleFromUrl("not a url")).toBe("Not A Url");
    expect(deriveTitleFromUrl("")).toBe("Untitled");
  });

  it("collapses mixed hyphen and underscore separators into single spaces", () => {
    expect(deriveTitleFromUrl("https://example.com/guides/multi-agent_orchestration.md")).toBe(
      "Multi Agent Orchestration",
    );
  });
});
