import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import { applyTriageAction } from "./gap-triage";

const NOW = "2026-05-31T00:00:00.000Z";

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
    untriagedSince: NOW,
    autoDeferredAt: null,
    ...overrides,
  };
}

describe("applyTriageAction — important", () => {
  it.each(["untriaged", "user_deferred", "dismissed"] as const)(
    "flags a %s gap as important and clears deferred/dismissed fields",
    (triageState) => {
      const result = applyTriageAction(
        gap({
          id: "g1",
          triageState,
          deferredUntil: "2026-06-01T00:00:00.000Z",
          dismissedAt: "2026-01-01T00:00:00.000Z",
          dismissedCheckinSentAt: "2026-02-01T00:00:00.000Z",
        }),
        "important",
        NOW,
      );

      expect(result.changed).toBe(true);
      expect(result.gap.triageState).toBe("important");
      expect(result.gap.triagedAt).toBe(NOW);
      expect(result.gap.deferredUntil).toBeNull();
      expect(result.gap.dismissedAt).toBeNull();
      expect(result.gap.dismissedCheckinSentAt).toBeNull();
    },
  );

  it("is a no-op when the gap is already important", () => {
    const current = gap({ id: "g1", triageState: "important", triagedAt: "earlier" });

    const result = applyTriageAction(current, "important", NOW);

    expect(result.changed).toBe(false);
    expect(result.gap).toEqual(current);
  });

  it("never writes the unrelated `wanted` web-star column", () => {
    const current = gap({ id: "g1", wanted: true });

    const result = applyTriageAction(current, "important", NOW);

    expect(result.gap.wanted).toBe(current.wanted);
  });
});

describe("applyTriageAction — defer", () => {
  it("defers an untriaged gap for 60 days and starts the deferral count at 1", () => {
    const result = applyTriageAction(gap({ id: "g1" }), "defer", NOW);

    expect(result.changed).toBe(true);
    expect(result.gap.triageState).toBe("user_deferred");
    expect(result.gap.deferralCount).toBe(1);
    expect(result.gap.deferredUntil).toBe("2026-07-30T00:00:00.000Z");
  });

  it("is a same-state no-op on a genuine double-tap while the deferral is still live", () => {
    const current = gap({
      id: "g1",
      triageState: "user_deferred",
      deferredUntil: "2026-06-15T00:00:00.000Z",
      deferralCount: 2,
    });

    const result = applyTriageAction(current, "defer", NOW);

    expect(result.changed).toBe(false);
    expect(result.gap.deferralCount).toBe(2);
  });

  it("treats a resurfaced re-defer as a fresh choice, incrementing the count even though the label repeats", () => {
    const current = gap({
      id: "g1",
      triageState: "untriaged",
      deferralCount: 2,
    });

    const result = applyTriageAction(current, "defer", NOW);

    expect(result.changed).toBe(true);
    expect(result.gap.deferralCount).toBe(3);
    expect(result.gap.triageState).toBe("user_deferred");
  });

  it("clears any prior dismissed fields when deferring", () => {
    const current = gap({
      id: "g1",
      triageState: "dismissed",
      dismissedAt: "2026-01-01T00:00:00.000Z",
      dismissedCheckinSentAt: "2026-02-01T00:00:00.000Z",
    });

    const result = applyTriageAction(current, "defer", NOW);

    expect(result.gap.dismissedAt).toBeNull();
    expect(result.gap.dismissedCheckinSentAt).toBeNull();
  });
});

describe("applyTriageAction — dismiss", () => {
  it.each(["untriaged", "important", "user_deferred"] as const)(
    "allows dismissing from %s with no blocking on current state",
    (triageState) => {
      const result = applyTriageAction(
        gap({ id: "g1", triageState, deferredUntil: "2026-06-15T00:00:00.000Z" }),
        "dismiss",
        NOW,
      );

      expect(result.changed).toBe(true);
      expect(result.gap.triageState).toBe("dismissed");
      expect(result.gap.dismissedAt).toBe(NOW);
      expect(result.gap.deferredUntil).toBeNull();
      expect(result.gap.dismissedCheckinSentAt).toBeNull();
    },
  );

  it("is a no-op when the gap is already dismissed", () => {
    const current = gap({
      id: "g1",
      triageState: "dismissed",
      dismissedAt: "earlier",
      dismissedCheckinSentAt: "also-earlier",
    });

    const result = applyTriageAction(current, "dismiss", NOW);

    expect(result.changed).toBe(false);
    expect(result.gap).toEqual(current);
  });

  it("restarts the 6-month check-in clock on a fresh re-dismissal", () => {
    const current = gap({
      id: "g1",
      triageState: "important",
      dismissedCheckinSentAt: "2025-01-01T00:00:00.000Z",
    });

    const result = applyTriageAction(current, "dismiss", NOW);

    expect(result.gap.dismissedCheckinSentAt).toBeNull();
  });
});

describe("applyTriageAction — revisit (dismissed check-in's 'Actually, let's revisit')", () => {
  it("reopens a dismissed gap to untriaged and clears its dismissed bookkeeping", () => {
    const current = gap({
      id: "g1",
      triageState: "dismissed",
      dismissedAt: "2026-01-01T00:00:00.000Z",
      dismissedCheckinSentAt: "2026-07-01T00:00:00.000Z",
    });

    const result = applyTriageAction(current, "revisit", NOW);

    expect(result.changed).toBe(true);
    expect(result.gap.triageState).toBe("untriaged");
    expect(result.gap.dismissedAt).toBeNull();
    expect(result.gap.dismissedCheckinSentAt).toBeNull();
  });

  it("is a no-op when the gap is already untriaged", () => {
    const current = gap({ id: "g1", triageState: "untriaged" });

    const result = applyTriageAction(current, "revisit", NOW);

    expect(result.changed).toBe(false);
  });

  it("resets untriagedSince to now — issue #33's 'every return to untriaged earns a fresh 3-day window'", () => {
    const current = gap({
      id: "g1",
      triageState: "dismissed",
      untriagedSince: "2020-01-01T00:00:00.000Z",
    });

    const result = applyTriageAction(current, "revisit", NOW);

    expect(result.gap.untriagedSince).toBe(NOW);
  });
});
