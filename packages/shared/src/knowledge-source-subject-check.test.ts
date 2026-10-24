import { describe, expect, it } from "vitest";
import {
  SUBJECT_CHECK_MAX_EXCERPT_CHARS,
  subjectCheckConfidenceSchema,
  subjectCheckRequestSchema,
  subjectCheckResponseSchema,
} from "./knowledge-source-subject-check";

describe("subjectCheckRequestSchema", () => {
  it("should accept a pasted text and a link with a parent scope", () => {
    const result = subjectCheckRequestSchema.safeParse({
      blocks: [
        { type: "text", value: "Photosynthesis turns light into sugar." },
        { type: "url", value: "https://example.com/a" },
      ],
      parentSubjectId: "s1",
    });

    expect(result.success).toBe(true);
  });

  it("should refuse an excerpt longer than the per-block cap", () => {
    const result = subjectCheckRequestSchema.safeParse({
      blocks: [{ type: "text", value: "a".repeat(SUBJECT_CHECK_MAX_EXCERPT_CHARS + 1) }],
    });

    expect(result.success).toBe(false);
  });

  it("should refuse more than five blocks", () => {
    const blocks = Array.from({ length: 6 }, () => ({ type: "text", value: "x" }));

    expect(subjectCheckRequestSchema.safeParse({ blocks }).success).toBe(false);
  });

  it("should refuse excerpts that together pass the total cap", () => {
    const blocks = Array.from({ length: 3 }, () => ({ type: "text", value: "a".repeat(1_400) }));

    expect(subjectCheckRequestSchema.safeParse({ blocks }).success).toBe(false);
  });

  it("should refuse a check with no text at all", () => {
    expect(subjectCheckRequestSchema.safeParse({ blocks: [] }).success).toBe(false);
  });
});

describe("subjectCheckResponseSchema", () => {
  it("should accept advice with a recommendation and a new-subject proposal", () => {
    const result = subjectCheckResponseSchema.safeParse({
      status: "ok",
      recommendations: [{ subjectId: "s1", subjectLabel: "Biology", confidence: "high", reason: "Plants." }],
      newSubject: { name: "Botany", parentSubjectId: null, parentLabel: null, kind: "general", reason: "Fits." },
    });

    expect(result.success).toBe(true);
  });

  it("should refuse more than three recommendations", () => {
    const recommendation = { subjectId: "s1", subjectLabel: "Biology", confidence: "low", reason: "r" };

    const result = subjectCheckResponseSchema.safeParse({
      status: "ok",
      recommendations: [recommendation, recommendation, recommendation, recommendation],
      newSubject: null,
    });

    expect(result.success).toBe(false);
  });

  it("should accept the none answer", () => {
    expect(subjectCheckResponseSchema.safeParse({ status: "none" }).success).toBe(true);
  });

  it.each(["disabled", "budget", "rate_limited", "timeout", "failed"])(
    "should accept unavailable because of %s",
    (reason) => {
      expect(subjectCheckResponseSchema.safeParse({ status: "unavailable", reason }).success).toBe(true);
    },
  );

  it("should refuse an unavailable answer with an unknown reason", () => {
    expect(subjectCheckResponseSchema.safeParse({ status: "unavailable", reason: "sleepy" }).success).toBe(false);
  });
});

describe("subjectCheckConfidenceSchema", () => {
  it("should accept only high, medium or low", () => {
    expect(subjectCheckConfidenceSchema.options).toEqual(["high", "medium", "low"]);
  });
});
