import { describe, expect, it } from "vitest";
import { resolveReviewedAt } from "./knowledge-bit-review-time.js";

const NOW = new Date("2026-11-10T12:00:00.000Z");

describe("resolveReviewedAt", () => {
  it("should grade at the server's current time when the phone sends no review time", () => {
    expect(resolveReviewedAt({}, NOW)).toEqual({ ok: true, reviewedAt: NOW });
  });

  it("should keep the original review time when the phone's clock is accurate", () => {
    const result = resolveReviewedAt(
      { reviewedAt: "2026-11-10T08:00:00.000Z", sentAt: "2026-11-10T12:00:00.000Z" },
      NOW,
    );

    expect(result).toEqual({ ok: true, reviewedAt: new Date("2026-11-10T08:00:00.000Z") });
  });

  it("should shift the review time by how far the phone's clock is behind the server", () => {
    const result = resolveReviewedAt(
      { reviewedAt: "2026-11-10T07:50:00.000Z", sentAt: "2026-11-10T11:50:00.000Z" },
      NOW,
    );

    expect(result).toEqual({ ok: true, reviewedAt: new Date("2026-11-10T08:00:00.000Z") });
  });

  it("should clamp a review time in the future to now instead of dropping the grade", () => {
    expect(resolveReviewedAt({ reviewedAt: "2026-11-10T12:01:30.000Z" }, NOW)).toEqual({ ok: true, reviewedAt: NOW });
    expect(resolveReviewedAt({ reviewedAt: "2026-11-10T14:00:00.000Z" }, NOW)).toEqual({ ok: true, reviewedAt: NOW });
  });

  it("should refuse a review older than 14 days", () => {
    const result = resolveReviewedAt({ reviewedAt: "2026-10-27T11:59:00.000Z" }, NOW);

    expect(result).toEqual({ ok: false, error: "review_time_out_of_range" });
  });

  it("should accept a review just inside the 14-day limit", () => {
    const result = resolveReviewedAt({ reviewedAt: "2026-10-27T12:01:00.000Z" }, NOW);

    expect(result.ok).toBe(true);
  });
});
