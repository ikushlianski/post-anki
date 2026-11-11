import { describe, expect, it } from "vitest";
import { initialBitState } from "./knowledge-bit-initial-state.js";

describe("initialBitState", () => {
  it("should send a new card to triage when the learner switched triage on", () => {
    expect(initialBitState(true)).toEqual({ approvalState: "pending" });
  });

  it("should make a new card studyable at once when triage is off", () => {
    const now = new Date("2026-01-01T00:00:00Z");

    expect(initialBitState(false, now)).toEqual({ approvalState: "approved", decidedAt: now });
  });
});
