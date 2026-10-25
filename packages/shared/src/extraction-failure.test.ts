import { describe, expect, it } from "vitest";
import {
  EXTRACTION_STUCK_AFTER_MS,
  GENERIC_CARD_FLAG_WORDING,
  GENERIC_EXTRACTION_FAILURE_WORDING,
  attentionFirstWords,
  attentionWording,
  cardFlagWording,
  deriveAttentionKind,
  extractionFailureWording,
} from "./extraction-failure.js";

const KNOWN_CODES = [
  "no_valid_items",
  "wrong_language",
  "source_empty",
  "source_too_long",
  "source_chunk_missing",
  "knowledge_source_reclaimed",
  "extraction_failed",
  "provider_rate_limited",
  "workflow_executor_lost",
];

describe("extractionFailureWording", () => {
  it.each(KNOWN_CODES)("should give %s plain wording without the raw code", (code) => {
    const text = extractionFailureWording(code);

    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toContain("_");
  });

  it("should tell the user when the AI could not produce a card", () => {
    expect(extractionFailureWording("no_valid_items")).toBe("The AI could not produce a usable card from this note.");
  });

  it("should tell the user when the AI service is busy", () => {
    expect(extractionFailureWording("provider_rate_limited")).toContain("busy");
  });

  it.each([null, undefined, "", "durable:abc", "Error: socket hang up at foo", "toString", "__proto__"])(
    "should fall back to the generic wording for %s",
    (reason) => {
      expect(extractionFailureWording(reason)).toBe(GENERIC_EXTRACTION_FAILURE_WORDING);
    },
  );
});

describe("cardFlagWording", () => {
  it("should explain an unmatched quote in plain words", () => {
    expect(cardFlagWording("quote_not_in_source")).toBe("The supporting quote could not be matched to your note");
    expect(cardFlagWording("quote_length")).toBe(cardFlagWording("quote_not_in_source"));
  });

  it("should use one wording for both malformed blank reasons", () => {
    expect(cardFlagWording("bad_blank")).toBe(cardFlagWording("answer_not_in_statement"));
  });

  it("should fall back for an unknown flag", () => {
    expect(cardFlagWording("something_new")).toBe(GENERIC_CARD_FLAG_WORDING);
    expect(cardFlagWording(null)).toBe(GENERIC_CARD_FLAG_WORDING);
  });
});

describe("attentionWording", () => {
  it("should word stuck and empty notes without a failure code", () => {
    expect(attentionWording("stuck", null)).toContain("20 minutes");
    expect(attentionWording("empty_result", null)).toContain("found nothing");
  });

  it("should use the failure wording for failed and rate limited notes", () => {
    expect(attentionWording("failed", "source_empty")).toBe("This note has no text.");
    expect(attentionWording("rate_limited", "provider_rate_limited")).toContain("busy");
  });
});

describe("attentionFirstWords", () => {
  it("should shorten a long note to its first words", () => {
    const text = attentionFirstWords(`${"word ".repeat(60)}`);

    expect(text.length).toBeLessThanOrEqual(83);
    expect(text.endsWith("...")).toBe(true);
  });

  it("should keep a short note whole and tolerate no text", () => {
    expect(attentionFirstWords("  hello\n world ")).toBe("hello world");
    expect(attentionFirstWords(null)).toBe("");
  });
});

describe("deriveAttentionKind", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const fresh = new Date(now.getTime() - 60_000);
  const old = new Date(now.getTime() - EXTRACTION_STUCK_AFTER_MS - 1000);
  const base = { failureReason: null, updatedAt: fresh, liveCardCount: 0, processed: false, now };

  it("should flag any failed note whatever the reason", () => {
    expect(deriveAttentionKind({ ...base, status: "failed", failureReason: "no_valid_items" })).toBe("failed");
    expect(deriveAttentionKind({ ...base, status: "failed", failureReason: "weird free text" })).toBe("failed");
  });

  it("should flag a finished note with no live cards that was not marked done", () => {
    expect(deriveAttentionKind({ ...base, status: "bits_detected" })).toBe("empty_result");
  });

  it("should stay quiet when the user already decided every card or marked it done", () => {
    expect(deriveAttentionKind({ ...base, status: "bits_detected", liveCardCount: 3 })).toBeNull();
    expect(deriveAttentionKind({ ...base, status: "bits_detected", processed: true })).toBeNull();
  });

  it("should not alarm for a note processing under 20 minutes", () => {
    expect(deriveAttentionKind({ ...base, status: "processing" })).toBeNull();
  });

  it("should flag a note processing past 20 minutes as stuck", () => {
    expect(deriveAttentionKind({ ...base, status: "processing", updatedAt: old })).toBe("stuck");
  });

  it("should show a rate limited wait as information until it becomes stuck", () => {
    const rate = { ...base, status: "processing", failureReason: "provider_rate_limited" };

    expect(deriveAttentionKind(rate)).toBe("rate_limited");
    expect(deriveAttentionKind({ ...rate, updatedAt: old })).toBe("stuck");
  });

  it("should ignore notes not started yet", () => {
    expect(deriveAttentionKind({ ...base, status: "pending" })).toBeNull();
  });
});
