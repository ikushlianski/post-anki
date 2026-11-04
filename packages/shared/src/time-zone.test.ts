import { describe, expect, it } from "vitest";
import { ownerStatsAiSpendQuerySchema } from "./owner-stats-ai-spend";
import { validTimeZoneSchema } from "./time-zone";

describe("validTimeZoneSchema", () => {
  it("should accept a real zone and reject a typo", () => {
    expect(validTimeZoneSchema.safeParse("Europe/Lisbon").success).toBe(true);
    expect(validTimeZoneSchema.safeParse("Europe/Lisbonn").success).toBe(false);
    expect(validTimeZoneSchema.safeParse("").success).toBe(false);
  });
});

describe("ownerStatsAiSpendQuerySchema", () => {
  it("should default the zone to UTC", () => {
    expect(ownerStatsAiSpendQuerySchema.parse({}).tz).toBe("UTC");
  });

  it("should reject an unknown zone so the API can answer 400 instead of failing in the database", () => {
    expect(ownerStatsAiSpendQuerySchema.safeParse({ tz: "Mars/Base" }).success).toBe(false);
  });
});
