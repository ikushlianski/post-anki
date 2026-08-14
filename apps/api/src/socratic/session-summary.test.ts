import { describe, expect, it } from "vitest";
import type { Gap } from "@post-anki/shared";
import type { TopicRow } from "../topic/topic-progress.repo.js";
import type { SocraticTurnRow } from "./socratic.repo.js";
import { buildSessionSummary, lastActivityAt } from "./session-summary.js";

function makeTopicRow(over: Partial<TopicRow> = {}): TopicRow {
  return {
    id: "t1",
    title: "TanStack Start",
    depth: "working",
    ...over,
  } as unknown as TopicRow;
}

function makeGap(over: Partial<Gap> = {}): Gap {
  return {
    id: "g1",
    topicId: "t1",
    label: "Server functions",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: true,
    concern: null,
    lastEvaluatedAt: null,
    triageState: "untriaged",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    untriagedSince: "2026-06-24T00:00:00.000Z",
    autoDeferredAt: null,
    ...over,
  };
}

function makeTurn(over: Partial<SocraticTurnRow> = {}): SocraticTurnRow {
  return {
    id: "turn1",
    sessionId: "ss1",
    gapId: "g1",
    conceptLabel: "Server functions",
    order: 1,
    prompt: "Explain a server function.",
    answer: null,
    degree: null,
    action: null,
    createdAt: new Date("2026-08-14T10:00:00.000Z"),
    answeredAt: null,
    ...over,
  };
}

describe("buildSessionSummary", () => {
  it("collects the deduplicated, turn-order list of advanced concept labels", () => {
    const turns = [
      makeTurn({ id: "t1", order: 1, conceptLabel: "Loaders", action: "advance", answeredAt: new Date() }),
      makeTurn({ id: "t2", order: 2, conceptLabel: "Server functions", action: "advance", answeredAt: new Date() }),
      makeTurn({ id: "t3", order: 3, conceptLabel: "Loaders", action: "advance", answeredAt: new Date() }),
    ];

    const summary = buildSessionSummary(turns, makeTopicRow(), []);

    expect(summary.solidConcepts).toEqual(["Loaders", "Server functions"]);
  });

  it("excludes unanswered and non-advance turns from solidConcepts", () => {
    const turns = [
      makeTurn({ id: "t1", order: 1, conceptLabel: "Loaders", action: "advance", answeredAt: new Date() }),
      makeTurn({ id: "t2", order: 2, conceptLabel: "Retries", action: "point_out", answeredAt: new Date() }),
      makeTurn({ id: "t3", order: 3, conceptLabel: "Streaming", action: null, answeredAt: null }),
    ];

    const summary = buildSessionSummary(turns, makeTopicRow(), []);

    expect(summary.solidConcepts).toEqual(["Loaders"]);
  });

  it("counts exchangeCount as the number of answered turns, regardless of action", () => {
    const turns = [
      makeTurn({ id: "t1", action: "advance", answeredAt: new Date() }),
      makeTurn({ id: "t2", action: "point_out", answeredAt: new Date() }),
      makeTurn({ id: "t3", action: null, answeredAt: null }),
    ];

    const summary = buildSessionSummary(turns, makeTopicRow(), []);

    expect(summary.exchangeCount).toBe(2);
  });

  it("renders the real DepthLevel enum value, never the issue text's illustrative 'architect' label (AC 31)", () => {
    const summary = buildSessionSummary([], makeTopicRow({ depth: "deep" }), []);

    expect(summary.depth).toBe("deep");
    expect(["awareness", "working", "deep"]).toContain(summary.depth);
  });

  // AC 28 / SCENARIO 6 — the gap line stays honest, not silently faked. A
  // session with several struggling (non-"advance") turns must NOT have
  // that struggle converted into a logged gap — mostRecentGap/gapsLoggedCount
  // stay at their real, structurally-empty value regardless of how many
  // turns failed to advance.
  it("keeps mostRecentGap/gapsLoggedCount/crossCuttingConcerns at their honest-empty value even when turns struggled (AC 28, Scenario 6)", () => {
    const turns = [
      makeTurn({ id: "t1", action: "point_out", answeredAt: new Date() }),
      makeTurn({ id: "t2", action: "explain_hint", answeredAt: new Date() }),
      makeTurn({ id: "t3", action: "give_answer", answeredAt: new Date() }),
      makeTurn({ id: "t4", action: "move_on", answeredAt: new Date() }),
    ];

    const summary = buildSessionSummary(turns, makeTopicRow(), []);

    expect(summary.mostRecentGap).toBeNull();
    expect(summary.gapsLoggedCount).toBe(0);
    expect(summary.crossCuttingConcerns).toEqual([]);
  });

  it("computes topicMaturity from gapMaturity(gaps, depth), unchanged from the existing formula", () => {
    const gaps = [makeGap({ state: "covered" }), makeGap({ id: "g2", state: "open" })];

    const summary = buildSessionSummary([], makeTopicRow({ depth: "working" }), gaps);

    expect(summary.topicMaturity).toBe(50);
  });
});

describe("lastActivityAt", () => {
  it("returns the pending turn's createdAt when a pending turn exists (AC 15)", () => {
    const pending = makeTurn({ createdAt: new Date("2026-08-14T09:30:00.000Z") });
    const turns = [makeTurn({ createdAt: new Date("2026-08-14T08:00:00.000Z"), answeredAt: new Date("2026-08-14T08:05:00.000Z") })];

    expect(lastActivityAt(pending, turns)).toEqual(new Date("2026-08-14T09:30:00.000Z"));
  });

  it("falls back to the most recently answered turn's answeredAt when pending is null (AC 16)", () => {
    const turns = [
      makeTurn({ id: "t1", order: 1, answeredAt: new Date("2026-08-14T08:00:00.000Z") }),
      makeTurn({ id: "t2", order: 2, answeredAt: new Date("2026-08-14T08:10:00.000Z") }),
    ];

    expect(lastActivityAt(null, turns)).toEqual(new Date("2026-08-14T08:10:00.000Z"));
  });

  it("falls back further to the first turn's createdAt when no turn was ever answered (defensive backstop)", () => {
    const turns = [makeTurn({ createdAt: new Date("2026-08-14T07:00:00.000Z"), answeredAt: null })];

    expect(lastActivityAt(null, turns)).toEqual(new Date("2026-08-14T07:00:00.000Z"));
  });
});
