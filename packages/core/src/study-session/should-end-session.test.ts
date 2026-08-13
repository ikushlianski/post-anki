import { describe, it, expect } from "vitest";
import { shouldEndSession } from "./should-end-session";

const STARTED = "2026-08-08T10:00:00.000Z";

describe("shouldEndSession", () => {
  it("does not cut a session off before its planned duration elapses", () => {
    const ended = shouldEndSession({
      startedAt: STARTED,
      plannedDurationMinutes: 20,
      now: "2026-08-08T10:15:00.000Z",
      userRequestedEnd: false,
    });

    expect(ended).toBe(false);
  });

  it("ends the session once the planned duration has fully elapsed", () => {
    const ended = shouldEndSession({
      startedAt: STARTED,
      plannedDurationMinutes: 20,
      now: "2026-08-08T10:20:00.000Z",
      userRequestedEnd: false,
    });

    expect(ended).toBe(true);
  });

  it("ends early the moment Ilya taps 'End now', regardless of elapsed time", () => {
    const ended = shouldEndSession({
      startedAt: STARTED,
      plannedDurationMinutes: 20,
      now: "2026-08-08T10:01:00.000Z",
      userRequestedEnd: true,
    });

    expect(ended).toBe(true);
  });

  it("never ends a session that has not started yet", () => {
    const ended = shouldEndSession({
      startedAt: null,
      plannedDurationMinutes: 20,
      now: "2026-08-08T10:20:00.000Z",
      userRequestedEnd: false,
    });

    expect(ended).toBe(false);
  });
});
