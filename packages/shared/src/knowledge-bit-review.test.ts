import { describe, expect, it } from "vitest";
import {
  recordReviewInputSchema,
  reviewCardsQuerySchema,
  scheduleControlInputSchema,
} from "./knowledge-bit-review";

describe("recordReviewInputSchema", () => {
  it("should accept a grade and default to burying siblings", () => {
    expect(recordReviewInputSchema.parse({ variantId: "v1", grade: "good" }).burySiblings).toBe(true);
  });

  it("should reject an unknown grade and a bad time zone", () => {
    expect(recordReviewInputSchema.safeParse({ variantId: "v1", grade: "perfect" }).success).toBe(false);
    expect(recordReviewInputSchema.safeParse({ variantId: "v1", grade: "good", tz: "Mars/Base" }).success).toBe(false);
  });
});

describe("reviewCardsQuerySchema", () => {
  it("should default to 10 cards in UTC", () => {
    expect(reviewCardsQuerySchema.parse({})).toMatchObject({ limit: 10, tz: "UTC" });
  });

  it("should reject a limit of 0 and of 51", () => {
    expect(reviewCardsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(reviewCardsQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });

  it("should not learn ahead unless asked and cap it at 30 days", () => {
    expect(reviewCardsQuerySchema.parse({}).aheadDays).toBe(0);
    expect(reviewCardsQuerySchema.parse({ aheadDays: "7" }).aheadDays).toBe(7);
    expect(reviewCardsQuerySchema.safeParse({ aheadDays: "31" }).success).toBe(false);
    expect(reviewCardsQuerySchema.safeParse({ aheadDays: "-1" }).success).toBe(false);
    expect(reviewCardsQuerySchema.safeParse({ aheadDays: "1.5" }).success).toBe(false);
  });

  it("should reject an unknown time zone", () => {
    expect(reviewCardsQuerySchema.safeParse({ tz: "Mars/Base" }).success).toBe(false);
  });
});

describe("scheduleControlInputSchema", () => {
  it("should require suspended or buried", () => {
    expect(scheduleControlInputSchema.safeParse({}).success).toBe(false);
    expect(scheduleControlInputSchema.safeParse({ buried: true }).success).toBe(true);
  });
});
