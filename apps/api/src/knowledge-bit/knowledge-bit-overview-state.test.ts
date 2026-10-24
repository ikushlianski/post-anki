import { describe, expect, it } from "vitest";
import { deriveOverviewState } from "./knowledge-bit-overview-state.js";

const now = new Date("2026-01-10T00:00:00Z");
const base = { phase: "review", suspendedAt: null, buriedUntil: null };

describe("deriveOverviewState", () => {
  it("should call a card with no schedule new", () => {
    expect(deriveOverviewState(null, now)).toBe("new");
  });

  it("should show suspended over any learning phase", () => {
    expect(deriveOverviewState({ ...base, phase: "learning", suspendedAt: now }, now)).toBe("suspended");
  });

  it("should show buried only while the burial is still in the future", () => {
    expect(deriveOverviewState({ ...base, buriedUntil: new Date("2026-01-11T00:00:00Z") }, now)).toBe("buried");
    expect(deriveOverviewState({ ...base, buriedUntil: new Date("2026-01-09T00:00:00Z") }, now)).toBe("review");
  });

  it("should report the schedule phase for a card in normal rotation", () => {
    expect(deriveOverviewState({ ...base, phase: "relearning" }, now)).toBe("relearning");
  });
});
