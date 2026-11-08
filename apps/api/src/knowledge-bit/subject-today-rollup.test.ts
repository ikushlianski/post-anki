import { describe, expect, it } from "vitest";
import {
  applyReviewCapToQueue,
  boundByGlobalRemaining,
  bucketToday,
  capBucket,
  globalReviewsRemaining,
  reviewRemaining,
  rollupSubtree,
  summariseReviewCap,
  type CappedBucket,
} from "./subject-today-rollup.js";

const rows = [
  { id: "root", name: "Root", parentId: null },
  { id: "a", name: "A", parentId: "root" },
  { id: "b", name: "B", parentId: "root" },
];

describe("subject today rollup", () => {
  it("should treat a zero review cap as unlimited and never go below zero otherwise", () => {
    expect(reviewRemaining(0, 500)).toBe(Number.POSITIVE_INFINITY);
    expect(reviewRemaining(10, 4)).toBe(6);
    expect(reviewRemaining(10, 25)).toBe(0);
  });

  it("should cap reviews and new cards per bucket but never learning steps", () => {
    const capped = capBucket({ due: 37, learning: 7, reviewDue: 30, fresh: 9 }, { review: 5, fresh: 4 });

    expect(capped).toEqual({ due: 37, learning: 7, review: 5, fresh: 4 });
    expect(bucketToday(capped)).toBe(16);
  });

  it("should leave due reviews uncapped when the subject has no review cap", () => {
    const capped = capBucket(
      { due: 300, learning: 0, reviewDue: 300, fresh: 0 },
      { review: reviewRemaining(0, 120), fresh: 0 },
    );

    expect(capped.review).toBe(300);
  });

  it("should give each child its own inherited allowance so the parent sums both capped buckets", () => {
    const remaining = { review: reviewRemaining(50, 0), fresh: 0 };
    const buckets = new Map<string, CappedBucket>([
      ["a", capBucket({ due: 80, learning: 0, reviewDue: 80, fresh: 0 }, remaining)],
      ["b", capBucket({ due: 60, learning: 0, reviewDue: 60, fresh: 0 }, remaining)],
    ]);

    expect(rollupSubtree("root", rows, buckets).review).toBe(100);
    expect(rollupSubtree("a", rows, buckets).review).toBe(50);
  });

  it("should sum the whole subtree including the parent's own cards", () => {
    const buckets = new Map<string, CappedBucket>([
      ["root", { due: 3, learning: 1, review: 2, fresh: 3 }],
      ["a", { due: 9, learning: 4, review: 5, fresh: 6 }],
    ]);

    expect(rollupSubtree("root", rows, buckets)).toEqual({ due: 12, learning: 5, review: 7, fresh: 9 });
  });

  it("should bound today by the app-wide remaining reviews and ignore the bound when unlimited", () => {
    expect(boundByGlobalRemaining(40, 15)).toBe(15);
    expect(boundByGlobalRemaining(10, 15)).toBe(10);
    expect(boundByGlobalRemaining(40, null)).toBe(40);
    expect(globalReviewsRemaining(200, 230)).toBe(0);
    expect(globalReviewsRemaining(0, 230)).toBeNull();
  });

  it("should hide nothing and keep nextDue when every bucket still has allowance", () => {
    const summary = summariseReviewCap([{ subjectId: "a", due: 3 }], () => 10);
    const next = new Date("2090-03-11T00:00:00Z");

    expect(summary).toEqual({ reviewAvailable: 3, capHidesReviews: false });
    expect(
      applyReviewCapToQueue({ counts: { review: 3 }, nextDue: next }, summary, new Date("2090-03-12T00:00:00Z")),
    ).toEqual({ review: 3, nextDue: next });
  });

  it("should move nextDue to day end when the cap hides due reviews", () => {
    const summary = summariseReviewCap(
      [
        { subjectId: "a", due: 3 },
        { subjectId: "b", due: 2 },
      ],
      (id) => (id === "a" ? 0 : 5),
    );
    const dayEnd = new Date("2090-03-11T00:00:00Z");

    expect(summary).toEqual({ reviewAvailable: 2, capHidesReviews: true });
    expect(applyReviewCapToQueue({ counts: { review: 5 }, nextDue: null }, summary, dayEnd)).toEqual({
      review: 2,
      nextDue: dayEnd,
    });
  });
});
