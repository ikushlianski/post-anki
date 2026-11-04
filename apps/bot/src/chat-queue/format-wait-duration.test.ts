import { describe, expect, it } from "vitest";
import { formatWaitDuration } from "./format-wait-duration.js";

const NOW = new Date("2026-10-29T12:00:00Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("formatWaitDuration", () => {
  it("should show whole days for a card that waited three days", () => {
    expect(formatWaitDuration(ago(3 * 86_400_000 + 5 * 3_600_000), NOW)).toBe("3d");
  });

  it("should show whole hours for a card that waited five hours", () => {
    expect(formatWaitDuration(ago(5 * 3_600_000 + 59 * 60_000), NOW)).toBe("5h");
  });

  it("should switch from hours to days at exactly 24 hours", () => {
    expect(formatWaitDuration(ago(23 * 3_600_000 + 59 * 60_000), NOW)).toBe("23h");
    expect(formatWaitDuration(ago(24 * 3_600_000), NOW)).toBe("1d");
  });

  it("should show minutes for a card added under an hour ago", () => {
    expect(formatWaitDuration(ago(12 * 60_000), NOW)).toBe("12m");
  });

  it("should never show a negative wait when the timestamp is in the future", () => {
    expect(formatWaitDuration(new Date(NOW.getTime() + 3_600_000), NOW)).toBe("0m");
  });
});
