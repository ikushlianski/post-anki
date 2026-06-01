import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import { selectDailyPush, isStale, type PushCandidate } from "./daily-push";

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "t",
    label: "g",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<PushCandidate> & { topicId: string }): PushCandidate {
  return {
    topicTitle: "T",
    curriculumId: "c",
    curriculumName: "C",
    depth: "working",
    gaps: [],
    ...overrides,
  };
}

const NOW = "2026-05-31T00:00:00.000Z";

describe("selectDailyPush", () => {
  it("returns nothing when there is nothing open or stale", () => {
    expect(selectDailyPush([], NOW)).toBeNull();
  });

  it("prefers a wanted gap over a merely weak one", () => {
    const pick = selectDailyPush(
      [
        candidate({ topicId: "weak", gaps: [gap({ id: "w", depth: "awareness" })] }),
        candidate({
          topicId: "hot",
          depth: "deep",
          gaps: [gap({ id: "h", depth: "deep", wanted: true })],
        }),
      ],
      NOW,
    );

    expect(pick?.topicId).toBe("hot");
    expect(pick?.reason).toBe("wanted");
  });

  it("falls back to the shallowest open gap when nothing is wanted", () => {
    const pick = selectDailyPush(
      [
        candidate({ topicId: "deep", gaps: [gap({ id: "d", depth: "deep" })] }),
        candidate({ topicId: "shallow", gaps: [gap({ id: "s", depth: "awareness" })] }),
      ],
      NOW,
    );

    expect(pick?.topicId).toBe("shallow");
    expect(pick?.reason).toBe("weakest");
  });

  it("ignores gaps deeper than a topic's chosen ceiling", () => {
    const pick = selectDailyPush(
      [
        candidate({
          topicId: "capped",
          depth: "working",
          gaps: [gap({ id: "deep", depth: "deep" })],
        }),
      ],
      NOW,
    );

    expect(pick).toBeNull();
  });

  it("refreshes a long-untouched mastered gap when nothing is open", () => {
    const pick = selectDailyPush(
      [
        candidate({
          topicId: "old",
          gaps: [
            gap({
              id: "stale",
              state: "covered",
              lastEvaluatedAt: "2026-01-01T00:00:00.000Z",
            }),
          ],
        }),
      ],
      NOW,
    );

    expect(pick?.topicId).toBe("old");
    expect(pick?.reason).toBe("refresh");
  });

  it("does not refresh a recently-covered gap", () => {
    const pick = selectDailyPush(
      [
        candidate({
          topicId: "fresh",
          gaps: [
            gap({
              id: "recent",
              state: "covered",
              lastEvaluatedAt: "2026-05-30T00:00:00.000Z",
            }),
          ],
        }),
      ],
      NOW,
    );

    expect(pick).toBeNull();
  });
});

describe("isStale", () => {
  it("never marks a never-evaluated gap stale", () => {
    expect(isStale(null, NOW)).toBe(false);
  });

  it("marks a gap stale only past the 90-day window", () => {
    expect(isStale("2026-05-01T00:00:00.000Z", NOW)).toBe(false);
    expect(isStale("2025-12-01T00:00:00.000Z", NOW)).toBe(true);
  });
});
