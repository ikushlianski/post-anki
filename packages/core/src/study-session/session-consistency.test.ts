import { describe, it, expect } from "vitest";
import { sessionConsistency, type SessionConsistencyInput } from "./session-consistency";

const NOW = "2026-08-08T18:00:00.000Z";

function session(overrides: Partial<SessionConsistencyInput>): SessionConsistencyInput {
  return {
    status: "planned",
    scheduledFor: null,
    completedAt: null,
    ...overrides,
  };
}

describe("sessionConsistency", () => {
  it("computes planned-vs-completed counts and a rate over the rolling window", () => {
    const result = sessionConsistency(
      [
        session({ status: "completed", scheduledFor: "2026-08-01T10:00:00.000Z", completedAt: "2026-08-01T10:20:00.000Z" }),
        session({ status: "completed", scheduledFor: "2026-08-03T10:00:00.000Z", completedAt: "2026-08-03T10:20:00.000Z" }),
        session({ status: "abandoned", scheduledFor: "2026-08-05T10:00:00.000Z", completedAt: "2026-08-05T10:05:00.000Z" }),
        session({ status: "planned", scheduledFor: "2026-08-06T10:00:00.000Z", completedAt: null }),
      ],
      NOW,
      30,
    );

    expect(result).toEqual({ planned: 4, completed: 2, rate: 0.5 });
  });

  it("returns a zero rate rather than dividing by zero when nothing fell in the window", () => {
    const result = sessionConsistency([], NOW, 30);

    expect(result).toEqual({ planned: 0, completed: 0, rate: 0 });
  });

  it("excludes sessions scheduled or completed outside the rolling window", () => {
    const result = sessionConsistency(
      [
        session({ status: "completed", scheduledFor: "2026-01-01T10:00:00.000Z", completedAt: "2026-01-01T10:20:00.000Z" }),
        session({ status: "completed", scheduledFor: "2026-08-07T10:00:00.000Z", completedAt: "2026-08-07T10:20:00.000Z" }),
      ],
      NOW,
      30,
    );

    expect(result).toEqual({ planned: 1, completed: 1, rate: 1 });
  });

  it("does not count an ad hoc session that was never scheduled and never finished against consistency", () => {
    const result = sessionConsistency(
      [session({ status: "in_progress", scheduledFor: null, completedAt: null })],
      NOW,
      30,
    );

    expect(result).toEqual({ planned: 0, completed: 0, rate: 0 });
  });

  it("excludes a session scheduled in the future from the rollup until its time arrives", () => {
    const result = sessionConsistency(
      [session({ status: "planned", scheduledFor: "2026-08-09T10:00:00.000Z", completedAt: null })],
      NOW,
      30,
    );

    expect(result).toEqual({ planned: 0, completed: 0, rate: 0 });
  });
});
