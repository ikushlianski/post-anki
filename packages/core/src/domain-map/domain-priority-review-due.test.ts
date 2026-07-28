import { describe, it, expect } from "vitest";
import { isDomainPriorityReviewDue } from "./domain-priority-review-due";

// SCENARIO 2 (.planning/domain-priority-review/scenarios.md) — the pure
// review-due deriver: a subject that has never been reviewed
// (lastReviewedAt: null) is immediately due; otherwise due is a plain
// 30-day wall-clock check with an inclusive boundary. `now` is always an
// explicit parameter, never read internally via Date.now(), so this stays
// pure and testable with fixed dates. RED right now because
// packages/core/src/domain-map/domain-priority-review-due.ts does not
// exist — the import above fails to resolve.

const NOW = new Date("2026-07-28T12:00:00.000Z");

function daysBefore(days: number): string {
  const date = new Date(NOW);
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString();
}

describe("isDomainPriorityReviewDue", () => {
  describe("when the subject has never been reviewed", () => {
    it("is due regardless of now", () => {
      expect(isDomainPriorityReviewDue(null, NOW)).toBe(true);
    });
  });

  describe("when the last review is under the 30-day threshold", () => {
    it("is not due at 29 days", () => {
      expect(isDomainPriorityReviewDue(daysBefore(29), NOW)).toBe(false);
    });
  });

  describe("when the last review is exactly at the 30-day threshold", () => {
    it("is due (inclusive boundary)", () => {
      expect(isDomainPriorityReviewDue(daysBefore(30), NOW)).toBe(true);
    });
  });

  describe("when the last review is far past the threshold", () => {
    it("is due at 45 days", () => {
      expect(isDomainPriorityReviewDue(daysBefore(45), NOW)).toBe(true);
    });
  });
});
