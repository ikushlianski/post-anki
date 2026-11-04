import { describe, expect, it } from "vitest";

import { isSnoozed } from "./is-snoozed";

const NOW = new Date("2026-10-28T12:00:00.000Z");

describe("isSnoozed", () => {
  it("should treat a card with no snooze as waiting", () => {
    expect(isSnoozed({ snoozedUntil: null }, NOW)).toBe(false);
  });

  it("should treat a card snoozed into the future as snoozed", () => {
    expect(isSnoozed({ snoozedUntil: "2026-11-01T00:00:00.000Z" }, NOW)).toBe(true);
  });

  it("should treat a card whose snooze has expired as waiting", () => {
    expect(isSnoozed({ snoozedUntil: "2026-10-27T00:00:00.000Z" }, NOW)).toBe(false);
  });

  it("should treat a snooze ending exactly now as waiting", () => {
    expect(isSnoozed({ snoozedUntil: NOW.toISOString() }, NOW)).toBe(false);
  });
});
