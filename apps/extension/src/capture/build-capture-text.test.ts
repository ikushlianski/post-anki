import { describe, expect, it } from "vitest";

import { buildCaptureText, MAX_CAPTURE_CHARS } from "./build-capture-text.js";

describe("buildCaptureText", () => {
  it("should append the page URL as a Source line after the trimmed selection", () => {
    expect(
      buildCaptureText({ selection: "  hello  ", pageUrl: "https://example.com/a?q=1" }),
    ).toEqual({ ok: true, text: "hello\n\nSource: https://example.com/a?q=1" });
  });

  it("should drop the URL fragment but keep the query", () => {
    const result = buildCaptureText({ selection: "x", pageUrl: "https://example.com/a?q=1#sec" });

    expect(result).toEqual({ ok: true, text: "x\n\nSource: https://example.com/a?q=1" });
  });

  it("should reject javascript: and file: page URLs", () => {
    expect(buildCaptureText({ selection: "x", pageUrl: "javascript:alert(1)" })).toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(buildCaptureText({ selection: "x", pageUrl: "file:///etc/passwd" })).toEqual({
      ok: false,
      reason: "invalid_url",
    });
  });

  it("should reject a malformed page URL", () => {
    expect(buildCaptureText({ selection: "x", pageUrl: "not a url" })).toEqual({
      ok: false,
      reason: "invalid_url",
    });
  });

  it("should reject a blank selection", () => {
    expect(buildCaptureText({ selection: " \n\t ", pageUrl: "https://example.com/" })).toEqual({
      ok: false,
      reason: "empty_selection",
    });
  });

  it("should keep a 60,000-char selection within 50,000 chars with the Source line intact", () => {
    const result = buildCaptureText({
      selection: "a".repeat(60_000),
      pageUrl: "https://example.com/page",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.text.length).toBeLessThanOrEqual(MAX_CAPTURE_CHARS);
      expect(result.text.endsWith("\n\nSource: https://example.com/page")).toBe(true);
    }
  });
});
