import { describe, expect, it } from "vitest";
import {
  LIVENESS_GENERATION_THRESHOLD,
  LIVENESS_MAX_SCORE,
  LIVENESS_MIN_SCORE,
  LIVENESS_NUDGE_THRESHOLD,
} from "./liveness-constants";
import { computeLiveness } from "./liveness";
import { applyNudgeResponse, isDormant, shouldNudge } from "./nudge";

const NOW = "2026-08-07T00:00:00.000Z";

function daysAgo(days: number): string {
  return new Date(new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("shouldNudge", () => {
  it("asks about an item as soon as it has decayed to the nudge threshold", () => {
    expect(shouldNudge(LIVENESS_NUDGE_THRESHOLD, null, NOW)).toBe(true);
  });

  it("stays quiet while the item is still being worked on", () => {
    expect(shouldNudge(LIVENESS_GENERATION_THRESHOLD, null, NOW)).toBe(false);
  });

  it("never nudges about an entity whose liveness was never established", () => {
    expect(shouldNudge(null, null, NOW)).toBe(false);
  });

  it("does not ask again within the cooldown after a previous nudge", () => {
    expect(shouldNudge(LIVENESS_MIN_SCORE, daysAgo(3), NOW)).toBe(false);
  });

  it("does not ask again on the last day of the cooldown", () => {
    expect(shouldNudge(LIVENESS_MIN_SCORE, daysAgo(6), NOW)).toBe(false);
  });

  it("asks once more after the cooldown has elapsed", () => {
    expect(shouldNudge(LIVENESS_MIN_SCORE, daysAgo(7), NOW)).toBe(true);
  });

  it("relies on dormancy to stop asking about a declined item, since the schedule alone would ask again", () => {
    expect(shouldNudge(LIVENESS_MIN_SCORE, daysAgo(30), NOW)).toBe(true);
    expect(isDormant("no")).toBe(true);
  });
});

describe("applyNudgeResponse", () => {
  it("brings a dying item back above the generation threshold on a yes", () => {
    expect(applyNudgeResponse(LIVENESS_NUDGE_THRESHOLD, "yes")).toBeGreaterThanOrEqual(
      LIVENESS_GENERATION_THRESHOLD,
    );
  });

  it("is idempotent on repeated yes answers, so interest never ratchets upward", () => {
    const once = applyNudgeResponse(LIVENESS_NUDGE_THRESHOLD, "yes");

    expect(applyNudgeResponse(once, "yes")).toBe(once);
  });

  it("never pushes a score past the top of the 1-10 scale", () => {
    expect(applyNudgeResponse(LIVENESS_MAX_SCORE, "yes")).toBe(LIVENESS_MAX_SCORE);
  });

  it("leaves an already-thriving item where it is on a yes", () => {
    expect(applyNudgeResponse(8, "yes")).toBe(8);
  });

  it("restores a previously declined item the moment the learner says yes again", () => {
    expect(applyNudgeResponse(LIVENESS_MIN_SCORE, "yes")).toBeGreaterThanOrEqual(
      LIVENESS_GENERATION_THRESHOLD,
    );
  });

  it("drops the score to the bottom of the scale on a no", () => {
    expect(applyNudgeResponse(LIVENESS_MAX_SCORE, "no")).toBe(LIVENESS_MIN_SCORE);
  });
});

describe("isDormant", () => {
  it("suppresses an item only after the learner explicitly declined a nudge", () => {
    expect(isDormant("no")).toBe(true);
  });

  it("keeps an item surfacing after an accepted nudge", () => {
    expect(isDormant("yes")).toBe(false);
  });

  it("keeps an item surfacing when no nudge has ever been answered", () => {
    expect(isDormant(null)).toBe(false);
  });

  it("keeps a course that decayed over a long break surfacing, because only a decline hides it", () => {
    const score = computeLiveness(
      {
        lastActivityAt: daysAgo(90),
        lastNudgeAt: null,
        lastNudgeResponse: null,
        baseScore: null,
      },
      NOW,
    );

    expect(score).toBe(LIVENESS_MIN_SCORE);
    expect(isDormant(null)).toBe(false);
  });
});
