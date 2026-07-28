import { describe, it, expect } from "vitest";
import { domainPriorityDistance } from "./domain-priority";

// SCENARIO 1 (.planning/domain-priority-review/scenarios.md) — the pure
// priority-distance deriver: null targetDepth means "no target set," which
// must read as null (not 0, which would misleadingly read as "on track").
// Otherwise it's DEPTH_TARGET_PERCENT[targetDepth] - percent, floored at
// zero (exceeding a target is not a "negative distance"). RED right now
// because packages/core/src/domain-map/domain-priority.ts does not exist —
// the import above fails to resolve.

describe("domainPriorityDistance", () => {
  describe("when no target depth is set", () => {
    it("returns null, distinct from 0 (on-track)", () => {
      expect(domainPriorityDistance(null, 40)).toBeNull();
    });

    it("returns null regardless of percent, including 0", () => {
      expect(domainPriorityDistance(null, 0)).toBeNull();
    });
  });

  describe("when a target depth is set and percent is below the target", () => {
    it("returns the target percent minus the actual percent", () => {
      // DEPTH_TARGET_PERCENT.working (60) - 40 = 20
      expect(domainPriorityDistance("working", 40)).toBe(20);
    });

    it("returns 100 when percent is 0 and the target is deep", () => {
      expect(domainPriorityDistance("deep", 0)).toBe(100);
    });
  });

  describe("when percent meets or exceeds the target", () => {
    it("floors at 0 exactly at the target percent boundary", () => {
      // DEPTH_TARGET_PERCENT.awareness === 25
      expect(domainPriorityDistance("awareness", 25)).toBe(0);
    });

    it("floors at 0, never negative, when percent exceeds the target", () => {
      expect(domainPriorityDistance("awareness", 90)).toBe(0);
    });
  });
});
