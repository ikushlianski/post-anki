import { describe, expect, it } from "vitest";
import type { SubjectCheckResponse } from "@post-anki/shared";
import { classifyOutcome, needsEscalation, resolveFinalProposal } from "./subject-assignment.select.js";

function ok(confidence: "high" | "medium" | "low"): SubjectCheckResponse {
  return {
    status: "ok",
    recommendations: [{ subjectId: "sub_a", subjectLabel: "A", confidence, reason: "fits" }],
    newSubject: null,
  };
}

describe("classifyOutcome", () => {
  it("should keep the top recommendation with its confidence", () => {
    expect(classifyOutcome(ok("medium"))).toEqual({ kind: "proposal", proposal: { subjectId: "sub_a", confidence: "medium" } });
  });

  it("should treat no match as unclear so the stronger model gets a look", () => {
    expect(classifyOutcome({ status: "none" })).toEqual({ kind: "unclear" });
    expect(classifyOutcome({ status: "ok", recommendations: [], newSubject: null })).toEqual({ kind: "unclear" });
  });

  it("should stop the whole scan when checks are switched off or out of budget", () => {
    for (const reason of ["disabled", "budget", "rate_limited"] as const) {
      expect(classifyOutcome({ status: "unavailable", reason })).toEqual({ kind: "stop" });
    }
  });

  it("should skip one source without retrying when its own check failed", () => {
    expect(classifyOutcome({ status: "unavailable", reason: "timeout" })).toEqual({ kind: "skip" });
    expect(classifyOutcome({ status: "unavailable", reason: "failed" })).toEqual({ kind: "skip" });
  });
});

describe("needsEscalation", () => {
  it("should escalate only low confidence and unclear sources", () => {
    expect(needsEscalation(classifyOutcome(ok("low")))).toBe(true);
    expect(needsEscalation({ kind: "unclear" })).toBe(true);
    expect(needsEscalation(classifyOutcome(ok("medium")))).toBe(false);
    expect(needsEscalation(classifyOutcome(ok("high")))).toBe(false);
    expect(needsEscalation({ kind: "skip" })).toBe(false);
  });
});

describe("resolveFinalProposal", () => {
  const cheap = { subjectId: "sub_a", confidence: "low" as const };
  const strong = { subjectId: "sub_b", confidence: "high" as const };

  it("should prefer the stronger model and fall back to the cheap one when it has no answer", () => {
    expect(resolveFinalProposal(cheap, strong)).toBe(strong);
    expect(resolveFinalProposal(cheap, null)).toBe(cheap);
    expect(resolveFinalProposal(null, undefined)).toBeNull();
  });
});
