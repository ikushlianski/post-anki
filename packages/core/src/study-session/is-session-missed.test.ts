import { describe, it, expect } from "vitest";
import { isSessionMissed } from "./is-session-missed";

const NOW = "2026-08-08T18:00:00.000Z";

describe("isSessionMissed", () => {
  it("labels a planned session missed once its scheduled time has passed, purely for display", () => {
    expect(isSessionMissed("planned", "2026-08-08T17:00:00.000Z", NOW)).toBe(true);
  });

  it("does not label an upcoming planned session missed", () => {
    expect(isSessionMissed("planned", "2026-08-08T19:00:00.000Z", NOW)).toBe(false);
  });

  it("never labels an ad hoc session with no scheduled time as missed", () => {
    expect(isSessionMissed("planned", null, NOW)).toBe(false);
  });

  it("never labels a session that was already started or ended as missed", () => {
    expect(isSessionMissed("in_progress", "2026-08-08T17:00:00.000Z", NOW)).toBe(false);
    expect(isSessionMissed("completed", "2026-08-08T17:00:00.000Z", NOW)).toBe(false);
    expect(isSessionMissed("abandoned", "2026-08-08T17:00:00.000Z", NOW)).toBe(false);
  });
});
