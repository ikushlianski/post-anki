import { describe, it, expect } from "vitest";
import type { Gap, GapTriageState } from "@post-anki/shared";
import {
  AUTO_DEFER_AFTER_DAYS,
  AUTO_DEFERRED_PUSH_INTERVAL_DAYS,
  applyAutoDefer,
  autoDeferAnchor,
  effectiveTriageState,
  isAutoDeferDue,
  isAutoDeferredPushEligible,
  reactivateOnFail,
} from "./auto-defer";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNTRIAGED_SINCE = "2026-05-01T00:00:00.000Z";

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "t1",
    label: "some sub-skill",
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
    untriagedSince: UNTRIAGED_SINCE,
    autoDeferredAt: null,
    ...overrides,
  };
}

function iso(offsetMs: number): string {
  return new Date(new Date(UNTRIAGED_SINCE).getTime() + offsetMs).toISOString();
}

describe("named constants", () => {
  it("AUTO_DEFER_AFTER_DAYS and AUTO_DEFERRED_PUSH_INTERVAL_DAYS are both 3", () => {
    expect(AUTO_DEFER_AFTER_DAYS).toBe(3);
    expect(AUTO_DEFERRED_PUSH_INTERVAL_DAYS).toBe(3);
  });
});

describe("autoDeferAnchor", () => {
  it("returns untriagedSince + 3 days, derived only", () => {
    expect(autoDeferAnchor(gap({ id: "g1" }))).toBe(iso(3 * DAY_MS));
  });

  it("is identical before and after autoDeferredAt is stamped — the sweep never shifts the anchor", () => {
    const before = gap({ id: "g1", autoDeferredAt: null });
    const after = gap({ id: "g1", autoDeferredAt: "2026-06-01T00:00:00.000Z" });

    expect(autoDeferAnchor(before)).toBe(autoDeferAnchor(after));
  });
});

describe("isAutoDeferDue", () => {
  it("is false just under the 3-day boundary", () => {
    const g = gap({ id: "g1" });

    expect(isAutoDeferDue(g, iso(3 * DAY_MS - 60_000))).toBe(false);
  });

  it("is true at exactly the 3-day boundary — inclusive", () => {
    const g = gap({ id: "g1" });

    expect(isAutoDeferDue(g, iso(3 * DAY_MS))).toBe(true);
  });

  it.each(["important", "user_deferred", "auto_deferred", "dismissed"] as const)(
    "is always false for a %s gap, no matter how old untriagedSince is",
    (triageState) => {
      const g = gap({ id: "g1", triageState, untriagedSince: "2000-01-01T00:00:00.000Z" });

      expect(isAutoDeferDue(g, "2026-01-01T00:00:00.000Z")).toBe(false);
    },
  );
});

describe("effectiveTriageState", () => {
  it("returns auto_deferred for an untriaged gap past its anchor", () => {
    expect(effectiveTriageState(gap({ id: "g1" }), iso(3 * DAY_MS))).toBe("auto_deferred");
  });

  it("returns untriaged verbatim for an untriaged gap not yet due", () => {
    expect(effectiveTriageState(gap({ id: "g1" }), iso(DAY_MS))).toBe("untriaged");
  });

  it.each(["important", "user_deferred", "auto_deferred", "dismissed"] as const)(
    "returns %s verbatim regardless of due-ness",
    (triageState) => {
      expect(effectiveTriageState(gap({ id: "g1", triageState }), iso(30 * DAY_MS))).toBe(
        triageState as GapTriageState,
      );
    },
  );
});

describe("applyAutoDefer", () => {
  it("transitions a due untriaged gap to auto_deferred and stamps autoDeferredAt", () => {
    const now = iso(3 * DAY_MS);
    const result = applyAutoDefer(gap({ id: "g1" }), now);

    expect(result.changed).toBe(true);
    expect(result.gap.triageState).toBe("auto_deferred");
    expect(result.gap.autoDeferredAt).toBe(now);
  });

  it("leaves triagedAt null on the transition — auto-defer is not a user decision", () => {
    const result = applyAutoDefer(gap({ id: "g1", triagedAt: null }), iso(3 * DAY_MS));

    expect(result.gap.triagedAt).toBeNull();
  });

  it("leaves untriagedSince, deferralCount, deferredUntil, wanted, depth and state byte-for-byte unchanged", () => {
    const current = gap({
      id: "g1",
      deferralCount: 2,
      deferredUntil: null,
      wanted: true,
      depth: "deep",
      state: "open",
    });

    const result = applyAutoDefer(current, iso(3 * DAY_MS));

    expect(result.gap.untriagedSince).toBe(current.untriagedSince);
    expect(result.gap.deferralCount).toBe(current.deferralCount);
    expect(result.gap.deferredUntil).toBe(current.deferredUntil);
    expect(result.gap.wanted).toBe(current.wanted);
    expect(result.gap.depth).toBe(current.depth);
    expect(result.gap.state).toBe(current.state);
  });

  it("is a no-op for a not-yet-due untriaged gap", () => {
    const current = gap({ id: "g1" });
    const result = applyAutoDefer(current, iso(DAY_MS));

    expect(result.changed).toBe(false);
    expect(result.gap).toEqual(current);
  });

  it("'Important' gaps are never auto-deferred, even a year old — the most load-bearing case", () => {
    const current = gap({
      id: "g1",
      triageState: "important",
      untriagedSince: "2020-01-01T00:00:00.000Z",
    });

    expect(effectiveTriageState(current, "2026-05-31T00:00:00.000Z")).toBe("important");

    const result = applyAutoDefer(current, "2026-05-31T00:00:00.000Z");

    expect(result.changed).toBe(false);
  });

  it.each(["user_deferred", "dismissed", "auto_deferred"] as const)(
    "is a no-op for a %s gap of any age",
    (triageState) => {
      const current = gap({
        id: "g1",
        triageState,
        untriagedSince: "2020-01-01T00:00:00.000Z",
      });

      const result = applyAutoDefer(current, "2026-05-31T00:00:00.000Z");

      expect(result.changed).toBe(false);
    },
  );
});

describe("reactivateOnFail", () => {
  it("pulls a gap whose effective state is auto_deferred back to untriaged with a fresh window", () => {
    const now = iso(10 * DAY_MS);
    const result = reactivateOnFail(gap({ id: "g1" }), now);

    expect(result.changed).toBe(true);
    expect(result.gap.triageState).toBe("untriaged");
    expect(result.gap.untriagedSince).toBe(now);
    expect(result.gap.autoDeferredAt).toBeNull();
  });

  it("fires for a gap that is due but not yet swept — stored untriaged, past its anchor", () => {
    const now = iso(4 * DAY_MS);
    const notYetSwept = gap({ id: "g1", triageState: "untriaged", autoDeferredAt: null });

    const result = reactivateOnFail(notYetSwept, now);

    expect(result.changed).toBe(true);
    expect(result.gap.triageState).toBe("untriaged");
  });

  it("is a no-op for a not-yet-due untriaged gap — the Tuesday/Wednesday/Thursday rule", () => {
    const current = gap({ id: "g1" });
    const result = reactivateOnFail(current, iso(DAY_MS));

    expect(result.changed).toBe(false);
    expect(result.gap).toEqual(current);
  });

  it.each(["user_deferred", "important", "dismissed"] as const)(
    "is a no-op for a %s gap — a Fail never overrides an explicit user choice",
    (triageState) => {
      const current = gap({ id: "g1", triageState });
      const result = reactivateOnFail(current, iso(30 * DAY_MS));

      expect(result.changed).toBe(false);
    },
  );
});

describe("isAutoDeferredPushEligible", () => {
  it("is eligible on the anchor day (day 0), then every 3rd day, across a seven-day table", () => {
    const g = gap({ id: "g1" });
    const anchor = new Date(autoDeferAnchor(g));
    const anchorMidnight = Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate(),
    );

    const expected = [true, false, false, true, false, false, true];

    for (let day = 0; day < 7; day++) {
      const now = new Date(anchorMidnight + day * DAY_MS).toISOString();

      expect(isAutoDeferredPushEligible(g, now)).toBe(expected[day]);
    }
  });

  it("two gaps auto-deferred on different days have different eligible days — no single global 'auto-defer day'", () => {
    const gapA = gap({ id: "a", untriagedSince: "2026-05-01T00:00:00.000Z" });
    const gapB = gap({ id: "b", untriagedSince: "2026-05-02T00:00:00.000Z" });

    const now = autoDeferAnchor(gapA);

    expect(isAutoDeferredPushEligible(gapA, now)).toBe(true);
    expect(isAutoDeferredPushEligible(gapB, now)).toBe(false);
  });

  it("eligibility phase does not shift when the sweep runs", () => {
    const before = gap({ id: "g1", autoDeferredAt: null });
    const after = gap({ id: "g1", autoDeferredAt: "2026-06-10T00:00:00.000Z" });
    const now = iso(9 * DAY_MS);

    expect(isAutoDeferredPushEligible(before, now)).toBe(
      isAutoDeferredPushEligible(after, now),
    );
  });
});
