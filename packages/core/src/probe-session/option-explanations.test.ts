import { describe, it, expect } from "vitest";
import {
  extractUrls,
  sanitizeCitationUrl,
  sanitizeOptionExplanations,
  alignOptionExplanations,
  type OptionExplanation,
} from "./option-explanations";

describe("extractUrls", () => {
  it("finds every absolute http(s) URL in a block of fetched document text", () => {
    const text =
      "See https://docs.example.com/guide and also http://other.example.com/page for details.";

    expect(extractUrls(text)).toEqual([
      "https://docs.example.com/guide",
      "http://other.example.com/page",
    ]);
  });

  it("returns an empty array for text with no URLs", () => {
    expect(extractUrls("No links in this paragraph at all.")).toEqual([]);
  });

  it("strips trailing punctuation that isn't part of the URL", () => {
    const text = "Read the docs (https://example.com/path), then continue.";

    expect(extractUrls(text)).toEqual(["https://example.com/path"]);
  });
});

describe("sanitizeCitationUrl", () => {
  const knownUrls = ["https://docs.example.com/guide", "https://example.com/other"];

  it("keeps a citation that is present in the known-URL allowlist", () => {
    expect(sanitizeCitationUrl("https://docs.example.com/guide", knownUrls)).toBe(
      "https://docs.example.com/guide",
    );
  });

  it("drops a citation the model invented that never appeared in the grounding material", () => {
    expect(sanitizeCitationUrl("https://fabricated.example.com/fake", knownUrls)).toBeNull();
  });

  it("passes through a null citation unchanged", () => {
    expect(sanitizeCitationUrl(null, knownUrls)).toBeNull();
  });

  it("drops every citation when the allowlist is empty", () => {
    expect(sanitizeCitationUrl("https://docs.example.com/guide", [])).toBeNull();
  });
});

describe("sanitizeOptionExplanations", () => {
  const knownUrls = ["https://docs.example.com/guide"];

  it("nulls only the fabricated citation, keeping the explanation text and the rest of the question intact", () => {
    const explanations: OptionExplanation[] = [
      { text: "This is correct because...", citationUrl: "https://docs.example.com/guide" },
      { text: "This is wrong because...", citationUrl: "https://fabricated.example.com/fake" },
    ];

    const result = sanitizeOptionExplanations(explanations, knownUrls);

    expect(result[0]).toEqual({
      text: "This is correct because...",
      citationUrl: "https://docs.example.com/guide",
    });
    expect(result[1]).toEqual({
      text: "This is wrong because...",
      citationUrl: null,
    });
  });

  it("leaves explanations with no citation untouched", () => {
    const explanations: OptionExplanation[] = [
      { text: "Self-evident.", citationUrl: null },
    ];

    expect(sanitizeOptionExplanations(explanations, knownUrls)).toEqual(explanations);
  });

  it("nulls every citation when there is no grounding material to validate against", () => {
    const explanations: OptionExplanation[] = [
      { text: "This is correct because...", citationUrl: "https://docs.example.com/guide" },
    ];

    const result = sanitizeOptionExplanations(explanations, []);

    expect(result[0]!.citationUrl).toBeNull();
  });
});

describe("alignOptionExplanations", () => {
  it("pads missing explanations with a neutral placeholder when the model returns too few", () => {
    const options = ["A", "B", "C"];
    const explanations: OptionExplanation[] = [
      { text: "Why A", citationUrl: null },
    ];

    const result = alignOptionExplanations(options, explanations);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: "Why A", citationUrl: null });
    expect(result[1]).toEqual({ text: "No explanation available.", citationUrl: null });
    expect(result[2]).toEqual({ text: "No explanation available.", citationUrl: null });
  });

  it("truncates extra explanations when the model returns too many", () => {
    const options = ["A", "B"];
    const explanations: OptionExplanation[] = [
      { text: "Why A", citationUrl: null },
      { text: "Why B", citationUrl: null },
      { text: "Why C", citationUrl: null },
    ];

    const result = alignOptionExplanations(options, explanations);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.text)).toEqual(["Why A", "Why B"]);
  });

  it("returns the explanations unchanged when the lengths already match", () => {
    const options = ["A", "B"];
    const explanations: OptionExplanation[] = [
      { text: "Why A", citationUrl: null },
      { text: "Why B", citationUrl: "https://docs.example.com/guide" },
    ];

    expect(alignOptionExplanations(options, explanations)).toEqual(explanations);
  });
});
