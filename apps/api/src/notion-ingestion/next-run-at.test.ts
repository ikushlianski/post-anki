import { describe, expect, it } from "vitest";
import { computeNextRunAt } from "./next-run-at.js";

describe("computeNextRunAt", () => {
  it("should never schedule a manual source", () => {
    expect(computeNextRunAt("manual", new Date("2026-10-30T12:00:00Z"))).toBeNull();
  });

  it("should schedule a daily source 24 hours after the run", () => {
    expect(computeNextRunAt("daily", new Date("2026-10-30T12:30:00Z"))?.toISOString()).toBe(
      "2026-10-31T12:30:00.000Z",
    );
  });

  it("should schedule a nightly source at 01:00 UTC the same day when run before that hour", () => {
    expect(computeNextRunAt("nightly", new Date("2026-10-30T00:30:00Z"))?.toISOString()).toBe(
      "2026-10-30T01:00:00.000Z",
    );
  });

  it("should schedule a nightly source at 01:00 UTC the next day when run after that hour", () => {
    expect(computeNextRunAt("nightly", new Date("2026-10-30T01:00:00Z"))?.toISOString()).toBe(
      "2026-10-31T01:00:00.000Z",
    );
    expect(computeNextRunAt("nightly", new Date("2026-10-30T23:59:00Z"))?.toISOString()).toBe(
      "2026-10-31T01:00:00.000Z",
    );
  });
});
