import { describe, expect, it } from "vitest";

import {
  buildCaptureText,
  MAX_CAPTURE_CHARS,
  MAX_SOURCE_URL_CHARS,
  MAX_TITLE_CHARS,
} from "./build-capture-text.js";

describe("buildCaptureText", () => {
  it("should send the trimmed selection with link, title and subject as separate fields", () => {
    expect(
      buildCaptureText({
        selection: "  hello  ",
        pageUrl: "https://example.com/a?q=1",
        title: "  Docs page ",
        subjectId: "subj-1",
      }),
    ).toEqual({
      ok: true,
      body: {
        text: "hello",
        sourceUrl: "https://example.com/a?q=1",
        title: "Docs page",
        subjectId: "subj-1",
      },
    });
  });

  it("should never put a Source line into the text", () => {
    const result = buildCaptureText({ selection: "x", pageUrl: "https://example.com/" });

    expect(result).toEqual({ ok: true, body: { text: "x", sourceUrl: "https://example.com/" } });
  });

  it("should drop the URL fragment but keep the query", () => {
    const result = buildCaptureText({ selection: "x", pageUrl: "https://example.com/a?q=1#sec" });

    expect(result).toEqual({ ok: true, body: { text: "x", sourceUrl: "https://example.com/a?q=1" } });
  });

  it("should omit the link for non-http pages instead of failing the capture", () => {
    expect(buildCaptureText({ selection: "x", pageUrl: "javascript:alert(1)" })).toEqual({
      ok: true,
      body: { text: "x" },
    });
    expect(buildCaptureText({ selection: "x", pageUrl: "file:///etc/passwd" })).toEqual({
      ok: true,
      body: { text: "x" },
    });
    expect(buildCaptureText({ selection: "x", pageUrl: "not a url" })).toEqual({
      ok: true,
      body: { text: "x" },
    });
  });

  it("should omit a link longer than the API limit", () => {
    const pageUrl = `https://example.com/${"a".repeat(MAX_SOURCE_URL_CHARS)}`;

    expect(buildCaptureText({ selection: "x", pageUrl })).toEqual({ ok: true, body: { text: "x" } });
  });

  it("should omit blank title and subject", () => {
    expect(buildCaptureText({ selection: "x", title: "  ", subjectId: "" })).toEqual({
      ok: true,
      body: { text: "x" },
    });
  });

  it("should cap the title at 300 characters", () => {
    const result = buildCaptureText({ selection: "x", title: "t".repeat(500) });

    expect(result.ok && result.body.title?.length).toBe(MAX_TITLE_CHARS);
  });

  it("should reject a blank selection", () => {
    expect(buildCaptureText({ selection: " \n\t ", pageUrl: "https://example.com/" })).toEqual({
      ok: false,
      reason: "empty_selection",
    });
  });

  it("should cap a 60,000-char selection at 50,000 chars", () => {
    const result = buildCaptureText({ selection: "a".repeat(60_000) });

    expect(result.ok && result.body.text.length).toBe(MAX_CAPTURE_CHARS);
  });
});
