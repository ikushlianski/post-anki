import { describe, expect, it } from "vitest";
import {
  LIVENESS_GENERATION_THRESHOLD,
  LIVENESS_MIN_SCORE,
  LIVENESS_NUDGE_THRESHOLD,
  LIVENESS_STARTING_SCORE,
} from "./liveness-constants";
import { allowsGeneration, computeLiveness, type LivenessState } from "./liveness";
import { applyNudgeResponse } from "./nudge";

const NOW = "2026-08-07T00:00:00.000Z";

function daysAgo(days: number): string {
  return new Date(new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function state(overrides: Partial<LivenessState> = {}): LivenessState {
  return {
    lastActivityAt: null,
    lastNudgeAt: null,
    lastNudgeResponse: null,
    baseScore: null,
    ...overrides,
  };
}

describe("computeLiveness", () => {
  it("treats an entity that has never been active as unset rather than dead", () => {
    expect(computeLiveness(state(), NOW)).toBeNull();
  });

  it("lets a curriculum with no liveness history keep generating, because unset is not dead", () => {
    expect(allowsGeneration(computeLiveness(state(), NOW))).toBe(true);
  });

  it("starts a freshly approved item at the starting score", () => {
    expect(computeLiveness(state({ lastActivityAt: NOW }), NOW)).toBe(
      LIVENESS_STARTING_SCORE,
    );
  });

  it("keeps an item above the generation threshold while answering continues", () => {
    const score = computeLiveness(state({ lastActivityAt: daysAgo(3) }), NOW);

    expect(score).toBeGreaterThanOrEqual(LIVENESS_GENERATION_THRESHOLD);
    expect(allowsGeneration(score)).toBe(true);
  });

  it("stops generation after about a week of silence", () => {
    const score = computeLiveness(state({ lastActivityAt: daysAgo(7) }), NOW);

    expect(score).toBeLessThan(LIVENESS_GENERATION_THRESHOLD);
    expect(allowsGeneration(score)).toBe(false);
  });

  it("has decayed to the nudge threshold after one half-life of silence", () => {
    expect(computeLiveness(state({ lastActivityAt: daysAgo(10) }), NOW)).toBe(
      LIVENESS_NUDGE_THRESHOLD,
    );
  });

  it("never decays below the bottom of the 1-10 scale", () => {
    expect(computeLiveness(state({ lastActivityAt: daysAgo(90) }), NOW)).toBe(
      LIVENESS_MIN_SCORE,
    );
  });

  it("decays from a stored base score rather than always from the starting score", () => {
    const fromLowBase = computeLiveness(
      state({ lastActivityAt: daysAgo(10), baseScore: 4 }),
      NOW,
    );

    expect(fromLowBase).toBe(2);
  });

  it("revives a dormant-looking item from an accepted nudge without any answered question", () => {
    const score = computeLiveness(
      state({
        lastActivityAt: daysAgo(60),
        lastNudgeAt: NOW,
        lastNudgeResponse: "yes",
        baseScore: LIVENESS_STARTING_SCORE,
      }),
      NOW,
    );

    expect(score).toBeGreaterThanOrEqual(LIVENESS_GENERATION_THRESHOLD);
  });

  it("restarts the decay clock from the accepted nudge, not from the stale activity", () => {
    const score = computeLiveness(
      state({
        lastActivityAt: daysAgo(60),
        lastNudgeAt: daysAgo(1),
        lastNudgeResponse: "yes",
        baseScore: 2,
      }),
      NOW,
    );

    expect(score).toBe(6);
  });

  it("does not let a declined nudge act as a revival", () => {
    const score = computeLiveness(
      state({
        lastActivityAt: daysAgo(60),
        lastNudgeAt: daysAgo(1),
        lastNudgeResponse: "no",
        baseScore: LIVENESS_MIN_SCORE,
      }),
      NOW,
    );

    expect(score).toBe(LIVENESS_MIN_SCORE);
  });

  it("keeps recent answering as the anchor when the accepted nudge is older", () => {
    const score = computeLiveness(
      state({
        lastActivityAt: NOW,
        lastNudgeAt: daysAgo(30),
        lastNudgeResponse: "yes",
        baseScore: LIVENESS_STARTING_SCORE,
      }),
      NOW,
    );

    expect(score).toBe(LIVENESS_STARTING_SCORE);
  });

  it("does not ratchet upward across repeated cycles of yes followed by silence", () => {
    const afterFirstYes = applyNudgeResponse(LIVENESS_NUDGE_THRESHOLD, "yes");

    const decayedAgain = computeLiveness(
      state({ lastActivityAt: daysAgo(20), baseScore: afterFirstYes }),
      NOW,
    );

    const afterSecondYes = applyNudgeResponse(decayedAgain ?? 0, "yes");

    expect(decayedAgain).toBeLessThan(afterFirstYes);
    expect(afterSecondYes).toBe(afterFirstYes);
  });
});
