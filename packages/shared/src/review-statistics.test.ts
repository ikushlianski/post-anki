import { describe, expect, it } from "vitest";
import { reviewStatisticsQuerySchema } from "./review-statistics";

describe("reviewStatisticsQuerySchema", () => {
  it("should default to UTC, a 14-day forecast and a 90-day history", () => {
    expect(reviewStatisticsQuerySchema.parse({})).toEqual({ tz: "UTC", forecastDays: 14, historyDays: 90 });
  });

  it("should reject an invalid timezone", () => {
    expect(reviewStatisticsQuerySchema.safeParse({ tz: "Mars/Base" }).success).toBe(false);
  });

  it("should reject an unsupported forecast horizon", () => {
    expect(reviewStatisticsQuerySchema.safeParse({ forecastDays: "10" }).success).toBe(false);
  });

  it("should accept all-time history as 0 and coerce query strings", () => {
    const parsed = reviewStatisticsQuerySchema.parse({ historyDays: "0", forecastDays: "30", tz: "America/New_York" });

    expect(parsed).toMatchObject({ historyDays: 0, forecastDays: 30, tz: "America/New_York" });
  });

  it("should reject an unsupported history window", () => {
    expect(reviewStatisticsQuerySchema.safeParse({ historyDays: "45" }).success).toBe(false);
  });
});
