import { describe, expect, it } from "vitest";
import { putTriageDecisionInput, TRIAGE_DECISION_DWELL_MAX_MS, TRIAGE_DECISION_NOTE_MAX_CHARS } from "./card-triage-decision";

describe("putTriageDecisionInput", () => {
  it("should accept a bare verdict so an old-style decision still records", () => {
    expect(putTriageDecisionInput.parse({ verdict: "approved" })).toEqual({ verdict: "approved" });
  });

  it("should keep the reason and note of a rejected card", () => {
    const parsed = putTriageDecisionInput.parse({ verdict: "rejected", reasonCode: "bad_format", note: "  blank is odd " });

    expect(parsed).toEqual({ verdict: "rejected", reasonCode: "bad_format", note: "blank is odd" });
  });

  it("should refuse a reject reason on an accepted card", () => {
    expect(putTriageDecisionInput.safeParse({ verdict: "approved", reasonCode: "other" }).success).toBe(false);
  });

  it("should refuse a reason outside the fixed list", () => {
    expect(putTriageDecisionInput.safeParse({ verdict: "rejected", reasonCode: "boring" }).success).toBe(false);
  });

  it("should refuse a note over the cap", () => {
    const note = "x".repeat(TRIAGE_DECISION_NOTE_MAX_CHARS + 1);

    expect(putTriageDecisionInput.safeParse({ verdict: "approved", note }).success).toBe(false);
  });

  it("should clamp an absurd dwell time instead of refusing the decision", () => {
    const parsed = putTriageDecisionInput.parse({ verdict: "approved", dwellMs: 99_999_999.4 });

    expect(parsed.dwellMs).toBe(TRIAGE_DECISION_DWELL_MAX_MS);
  });

  it("should refuse a negative dwell time", () => {
    expect(putTriageDecisionInput.safeParse({ verdict: "approved", dwellMs: -5 }).success).toBe(false);
  });
});
