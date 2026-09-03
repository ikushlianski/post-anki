import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import { selectDailyPush, selectDueQueue, isStale, type PushCandidate } from "./daily-push";

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
    triageState: "untriaged",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    untriagedSince: NOW,
    autoDeferredAt: null,
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

  it("never accumulates a queue across repeated calls with the same unanswered gap present", () => {
    const candidates = [
      candidate({ topicId: "t1", gaps: [gap({ id: "g1", state: "open" })] }),
    ];

    const first = selectDailyPush(candidates, NOW);
    const second = selectDailyPush(candidates, NOW);
    const third = selectDailyPush(candidates, NOW);

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(first?.gap.id).toBe("g1");
  });

  it("never selects a dismissed or still-live-deferred gap, and prioritizes an important one over merely wanted", () => {
    const pick = selectDailyPush(
      [
        candidate({
          topicId: "dismissed",
          gaps: [gap({ id: "dismissed-gap", triageState: "dismissed" })],
        }),
        candidate({
          topicId: "deferred",
          gaps: [
            gap({
              id: "deferred-gap",
              triageState: "user_deferred",
              deferredUntil: "2026-06-15T00:00:00.000Z",
            }),
          ],
        }),
        candidate({
          topicId: "wanted-only",
          gaps: [gap({ id: "wanted-gap", wanted: true })],
        }),
        candidate({
          topicId: "important",
          gaps: [gap({ id: "important-gap", triageState: "important" })],
        }),
      ],
      NOW,
    );

    expect(pick?.topicId).toBe("important");
    expect(pick?.gap.id).toBe("important-gap");
    expect(pick?.reason).toBe("important");
  });

  it("no longer excludes a user-deferred gap once its deferral has elapsed", () => {
    const pick = selectDailyPush(
      [
        candidate({
          topicId: "resurfaced",
          gaps: [
            gap({
              id: "resurfaced-gap",
              triageState: "user_deferred",
              deferredUntil: "2026-05-01T00:00:00.000Z",
            }),
          ],
        }),
      ],
      NOW,
    );

    expect(pick?.gap.id).toBe("resurfaced-gap");
  });

  it("issue #33 — an auto-deferred gap REMAINS in push rotation: excluded on a non-eligible day, picked on its eligible day", () => {
    // untriagedSince 3 days before NOW puts the auto-defer anchor exactly at
    // NOW, so NOW is its eligible day (day 0); NOW + 1 day is not (day 1).
    const autoDeferred = gap({
      id: "auto",
      triageState: "auto_deferred",
      untriagedSince: "2026-05-28T00:00:00.000Z",
    });
    const untriaged = gap({ id: "regular" });

    const nonEligibleDay = "2026-06-01T00:00:00.000Z";

    const pickOnNonEligibleDay = selectDailyPush(
      [candidate({ topicId: "t", gaps: [autoDeferred, untriaged] })],
      nonEligibleDay,
    );

    expect(pickOnNonEligibleDay?.gap.id).toBe("regular");

    const pickOnEligibleDay = selectDailyPush(
      [candidate({ topicId: "t", gaps: [autoDeferred] })],
      NOW,
    );

    expect(pickOnEligibleDay?.gap.id).toBe("auto");
  });

  it("issue #33 — an auto-deferred gap on its eligible day is ranked by the existing wanted-then-depth sort, no penalty", () => {
    const autoDeferredWanted = gap({
      id: "auto",
      triageState: "auto_deferred",
      untriagedSince: "2026-05-28T00:00:00.000Z",
      wanted: true,
    });
    const untriagedNotWanted = gap({ id: "regular", wanted: false });

    const pick = selectDailyPush(
      [candidate({ topicId: "t", gaps: [autoDeferredWanted, untriagedNotWanted] })],
      NOW,
    );

    expect(pick?.gap.id).toBe("auto");
    expect(pick?.reason).toBe("wanted");
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

describe("selectDueQueue", () => {
  it("returns nothing when there is nothing open or stale", () => {
    expect(selectDueQueue([], NOW)).toEqual([]);
  });

  it("lists every eligible gap across more than one subject, not just the top pick", () => {
    const candidates = [
      candidate({
        topicId: "algebra",
        curriculumId: "c-math",
        gaps: [gap({ id: "a", depth: "working", wanted: true })],
      }),
      candidate({
        topicId: "closures",
        curriculumId: "c-js",
        gaps: [gap({ id: "c", depth: "working" })],
      }),
    ];

    const items = selectDueQueue(candidates, NOW);
    const pick = selectDailyPush(candidates, NOW);

    expect(items.map((i) => i.topicId).sort()).toEqual(["algebra", "closures"]);
    expect(items.find((i) => i.topicId === "algebra")?.reason).toBe("wanted");
    expect(items.find((i) => i.topicId === "closures")?.reason).toBe("weakest");
    expect(items[0]?.topicId).toBe(pick?.topicId);
  });

  it("ranks items using the same wanted-then-depth tie-break selectDailyPush uses, with the pick as the top item", () => {
    const candidates = [
      candidate({
        topicId: "at-ceiling",
        depth: "working",
        gaps: [gap({ id: "at-ceiling-gap", depth: "working" })],
      }),
      candidate({
        topicId: "most-shallow",
        depth: "deep",
        gaps: [gap({ id: "most-shallow-gap", depth: "awareness" })],
      }),
      candidate({
        topicId: "shallow",
        depth: "working",
        gaps: [gap({ id: "shallow-gap", depth: "awareness" })],
      }),
    ];

    const items = selectDueQueue(candidates, NOW);
    const pick = selectDailyPush(candidates, NOW);

    expect(items[0]?.topicId).toBe(pick?.topicId);
    expect(items[0]?.gap.id).toBe(pick?.gap.id);
    expect(items.map((i) => i.topicId)).toEqual(["most-shallow", "shallow", "at-ceiling"]);
  });

  it("keeps a merely-wanted gap in the list even once an important gap exists elsewhere, unlike selectDailyPush's single pick", () => {
    const candidates = [
      candidate({
        topicId: "wanted-only",
        gaps: [gap({ id: "wanted-gap", wanted: true })],
      }),
      candidate({
        topicId: "important",
        gaps: [gap({ id: "important-gap", triageState: "important" })],
      }),
    ];

    const items = selectDueQueue(candidates, NOW);
    const pick = selectDailyPush(candidates, NOW);

    expect(items.map((i) => i.topicId).sort()).toEqual(["important", "wanted-only"]);
    expect(items[0]?.topicId).toBe("important");
    expect(items[0]?.reason).toBe("important");
    expect(items[0]?.topicId).toBe(pick?.topicId);
    expect(items.find((i) => i.topicId === "wanted-only")?.reason).toBe("wanted");
  });

  it("ranks an important gap first, matching selectDailyPush's pick, when nothing is wanted", () => {
    const candidates = [
      candidate({
        topicId: "weakest",
        gaps: [gap({ id: "weakest-gap", depth: "awareness" })],
      }),
      candidate({
        topicId: "important",
        depth: "deep",
        gaps: [gap({ id: "important-gap", triageState: "important", depth: "deep" })],
      }),
    ];

    const items = selectDueQueue(candidates, NOW);
    const pick = selectDailyPush(candidates, NOW);

    expect(items).toHaveLength(2);
    expect(items[0]?.topicId).toBe("important");
    expect(items[0]?.topicId).toBe(pick?.topicId);
  });

  it("falls back to every stale refreshable gap when nothing is open", () => {
    const items = selectDueQueue(
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

    expect(items).toHaveLength(1);
    expect(items[0]?.topicId).toBe("old");
    expect(items[0]?.reason).toBe("refresh");
  });

  it("never surfaces a dismissed or still-live-deferred gap", () => {
    const items = selectDueQueue(
      [
        candidate({
          topicId: "dismissed",
          gaps: [gap({ id: "dismissed-gap", triageState: "dismissed" })],
        }),
        candidate({
          topicId: "deferred",
          gaps: [
            gap({
              id: "deferred-gap",
              triageState: "user_deferred",
              deferredUntil: "2026-06-15T00:00:00.000Z",
            }),
          ],
        }),
      ],
      NOW,
    );

    expect(items).toEqual([]);
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
