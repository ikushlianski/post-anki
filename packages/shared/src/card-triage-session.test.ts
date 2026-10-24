import { describe, expect, it } from "vitest";
import {
  finishTriageSessionInput,
  startTriageSessionInput,
  TRIAGE_FEEDBACK_MAX_CHARS,
  updateCardStyleNoteInput,
} from "./card-triage-session";

describe("finishTriageSessionInput", () => {
  it("should accept a session finished with no feedback text and no decisions", () => {
    expect(finishTriageSessionInput.parse({})).toEqual({ feedbackText: "", decisions: [] });
  });

  it("should refuse feedback text over the cap", () => {
    const result = finishTriageSessionInput.safeParse({ feedbackText: "x".repeat(TRIAGE_FEEDBACK_MAX_CHARS + 1) });

    expect(result.success).toBe(false);
  });

  it("should refuse 501 decisions in one session", () => {
    const decisions = Array.from({ length: 501 }, (_, index) => ({ bitId: `b${index}`, verdict: "approved" }));

    expect(finishTriageSessionInput.safeParse({ decisions }).success).toBe(false);
  });

  it("should refuse a verdict other than approved or rejected", () => {
    const result = finishTriageSessionInput.safeParse({ decisions: [{ bitId: "b1", verdict: "skipped" }] });

    expect(result.success).toBe(false);
  });
});

describe("startTriageSessionInput", () => {
  it("should allow a session over the whole queue with no subject", () => {
    expect(startTriageSessionInput.parse({})).toEqual({});
  });
});

describe("updateCardStyleNoteInput", () => {
  it("should refuse an update that changes nothing", () => {
    expect(updateCardStyleNoteInput.safeParse({}).success).toBe(false);
  });

  it("should refuse a note text over 160 characters", () => {
    expect(updateCardStyleNoteInput.safeParse({ text: "x".repeat(161) }).success).toBe(false);
  });

  it("should accept switching a note off and making it global", () => {
    expect(updateCardStyleNoteInput.safeParse({ enabled: false, subjectId: null }).success).toBe(true);
  });
});
