import { describe, expect, it } from "vitest";
import {
  deriveKnownSchedule,
  KNOWN_CARD_MAX_INTERVAL_DAYS,
  KNOWN_CARD_MIN_INTERVAL_DAYS,
} from "./knowledge-bit-known-schedule.js";

const now = new Date("2026-01-01T10:00:00Z");
const DAY_MS = 86_400_000;

describe("deriveKnownSchedule", () => {
  it("should put a never-studied card into review at the shortest known interval", () => {
    const next = deriveKnownSchedule(null, now, () => 0);

    expect(next.phase).toBe("review");
    expect(next.wasNew).toBe(true);
    expect(next.intervalDays).toBe(KNOWN_CARD_MIN_INTERVAL_DAYS);
    expect(next.dueAt.getTime()).toBe(now.getTime() + KNOWN_CARD_MIN_INTERVAL_DAYS * DAY_MS);
  });

  it("should never schedule beyond the longest known interval", () => {
    const next = deriveKnownSchedule(null, now, () => 0.999999);

    expect(next.intervalDays).toBe(KNOWN_CARD_MAX_INTERVAL_DAYS);
  });

  it("should keep ease and lapses of a card already studied", () => {
    const next = deriveKnownSchedule(
      { easeFactor: 1.9, intervalDays: 3, phase: "relearning", learningStep: 1, lapses: 4 },
      now,
      () => 0.5,
    );

    expect(next).toMatchObject({ easeFactor: 1.9, lapses: 4, learningStep: 0, phase: "review", wasNew: false });
    expect(next.intervalDays).toBeGreaterThanOrEqual(KNOWN_CARD_MIN_INTERVAL_DAYS);
    expect(next.intervalDays).toBeLessThanOrEqual(KNOWN_CARD_MAX_INTERVAL_DAYS);
  });
});
