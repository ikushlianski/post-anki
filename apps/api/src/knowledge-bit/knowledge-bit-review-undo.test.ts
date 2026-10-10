import { describe, expect, it } from "vitest";
import type { KnowledgeBitScheduleSnapshot } from "../db/schema.js";
import { deriveReviewUndo } from "./knowledge-bit-review-undo.js";
import type { KnowledgeBitScheduleRow } from "./knowledge-bit-schedule.repo.js";

const reviewedAt = new Date("2026-10-10T10:00:00Z");
const now = new Date("2026-10-10T10:05:00Z");

const snapshot: KnowledgeBitScheduleSnapshot = {
  easeFactor: 2.3,
  intervalDays: 6,
  dueAt: "2026-10-09T00:00:00.000Z",
  lastReviewedAt: "2026-10-03T00:00:00.000Z",
  reviewCount: 4,
  phase: "review",
  learningStep: 0,
  lapses: 7,
};

const current: KnowledgeBitScheduleRow = {
  easeFactor: 2.1,
  intervalDays: 1,
  dueAt: new Date("2026-10-10T10:10:00Z"),
  lastReviewedAt: reviewedAt,
  reviewCount: 5,
  phase: "relearning",
  learningStep: 0,
  lapses: 8,
  suspendedAt: null,
  buriedUntil: null,
};

const base = {
  review: { reviewedAt, undoneAt: null },
  snapshot,
  current,
  laterLiveReviewExists: false,
  now,
};

describe("deriveReviewUndo", () => {
  it("should give back exactly the schedule the card had before the grade", () => {
    const outcome = deriveReviewUndo(base);

    expect(outcome).toEqual({
      ok: true,
      row: {
        easeFactor: 2.3,
        intervalDays: 6,
        dueAt: new Date(snapshot.dueAt),
        lastReviewedAt: new Date("2026-10-03T00:00:00.000Z"),
        reviewCount: 4,
        phase: "review",
        learningStep: 0,
        lapses: 7,
        suspendedAt: null,
        buriedUntil: null,
      },
    });
  });

  it("should make an undone first grade a new card again", () => {
    const outcome = deriveReviewUndo({ ...base, snapshot: null });

    expect(outcome).toMatchObject({
      ok: true,
      row: { reviewCount: 0, phase: "new", lastReviewedAt: null, dueAt: reviewedAt },
    });
  });

  it("should default fields missing from an older snapshot", () => {
    const { phase: _p, learningStep: _l, lapses: _a, ...old } = snapshot;
    const outcome = deriveReviewUndo({ ...base, snapshot: old });

    expect(outcome).toMatchObject({
      ok: true,
      row: { phase: "review", learningStep: 0, lapses: 0 },
    });
  });

  it("should lift a leech suspension that the undone grade caused", () => {
    const outcome = deriveReviewUndo({
      ...base,
      current: { ...current, suspendedAt: reviewedAt },
    });

    expect(outcome).toMatchObject({ ok: true, row: { suspendedAt: null } });
  });

  it("should keep a suspension and bury the learner set after the grade", () => {
    const suspendedAt = new Date("2026-10-10T10:02:00Z");
    const buriedUntil = new Date("2026-10-11T00:00:00Z");
    const outcome = deriveReviewUndo({
      ...base,
      current: { ...current, suspendedAt, buriedUntil },
    });

    expect(outcome).toMatchObject({ ok: true, row: { suspendedAt, buriedUntil } });
  });

  it("should refuse an already undone grade", () => {
    expect(deriveReviewUndo({ ...base, review: { reviewedAt, undoneAt: now } })).toEqual({
      ok: false,
      error: "not_latest",
    });
  });

  it("should refuse when a later grade exists", () => {
    expect(deriveReviewUndo({ ...base, laterLiveReviewExists: true }).ok).toBe(false);
  });

  it("should refuse when the card was answered in typed mode since", () => {
    const later = { ...current, lastReviewedAt: new Date("2026-10-10T10:03:00Z") };

    expect(deriveReviewUndo({ ...base, current: later }).ok).toBe(false);
  });

  it("should refuse when the schedule row is gone", () => {
    expect(deriveReviewUndo({ ...base, current: null }).ok).toBe(false);
  });
});
