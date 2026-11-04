import { describe, expect, it } from "vitest";
import { pendingReviewCursorSchema, pendingReviewListWithTotalResponse } from "./knowledge-bit-pending-list";

describe("pendingReviewListWithTotalResponse", () => {
  it("should accept a page of cards together with the exact pending total", () => {
    expect(pendingReviewListWithTotalResponse.safeParse({ items: [{}], total: 57 }).success).toBe(true);
  });

  it("should reject a negative or fractional total so the remaining count is never wrong", () => {
    expect(pendingReviewListWithTotalResponse.safeParse({ items: [], total: -1 }).success).toBe(false);
    expect(pendingReviewListWithTotalResponse.safeParse({ items: [], total: 1.5 }).success).toBe(false);
  });

  it("should reject a response with no total, which is the bare-array shape", () => {
    expect(pendingReviewListWithTotalResponse.safeParse([]).success).toBe(false);
  });
});

describe("pendingReviewCursorSchema", () => {
  it("should accept no cursor so the first page loads exactly as before", () => {
    expect(pendingReviewCursorSchema.safeParse({}).success).toBe(true);
  });

  it("should accept a microsecond timestamp together with an id", () => {
    const parsed = pendingReviewCursorSchema.safeParse({ afterCreatedAt: "2026-01-01T00:00:00.123456Z", afterId: "kb_1" });

    expect(parsed.success).toBe(true);
  });

  it("should reject a timestamp without an id and an id without a timestamp so a page never skips cards", () => {
    expect(pendingReviewCursorSchema.safeParse({ afterCreatedAt: "2026-01-01T00:00:00Z" }).success).toBe(false);
    expect(pendingReviewCursorSchema.safeParse({ afterId: "kb_1" }).success).toBe(false);
  });

  it("should reject a timestamp that is not a date and an empty id", () => {
    expect(pendingReviewCursorSchema.safeParse({ afterCreatedAt: "yesterday", afterId: "kb_1" }).success).toBe(false);
    expect(pendingReviewCursorSchema.safeParse({ afterCreatedAt: "2026-01-01T00:00:00Z", afterId: "" }).success).toBe(false);
  });
});
