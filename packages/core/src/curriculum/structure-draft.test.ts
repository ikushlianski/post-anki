import { describe, it, expect } from "vitest";
import type { StructureTurn } from "@post-anki/shared";
import {
  STALE_PENDING_TURN_AGE_MS,
  draftProgressState,
  isStalePendingTurn,
} from "./structure-draft";

const BASE_TIME = new Date("2026-08-01T00:00:00.000Z").getTime();

function turn(overrides: Partial<StructureTurn> = {}): StructureTurn {
  return {
    id: "turn_1",
    curriculumId: "cur_1",
    role: "user",
    message: "hello",
    structureSnapshot: null,
    splitSuggestion: null,
    toolActions: [],
    status: "complete",
    pendingResearchCandidates: [],
    createdAt: new Date(BASE_TIME).toISOString(),
    ...overrides,
  };
}

describe("STALE_PENDING_TURN_AGE_MS", () => {
  it("is five minutes", () => {
    expect(STALE_PENDING_TURN_AGE_MS).toBe(5 * 60 * 1000);
  });
});

describe("isStalePendingTurn", () => {
  it("is false for an assistant pending turn just under the threshold", () => {
    const pending = turn({ role: "assistant", status: "pending" });

    expect(isStalePendingTurn(pending, BASE_TIME + 4 * 60 * 1000 + 59 * 1000)).toBe(false);
  });

  it("is true for an assistant pending turn at exactly the threshold", () => {
    const pending = turn({ role: "assistant", status: "pending" });

    expect(isStalePendingTurn(pending, BASE_TIME + 5 * 60 * 1000)).toBe(true);
  });

  it("is false for a user turn regardless of age", () => {
    const oldUserTurn = turn({ role: "user", status: "pending" });

    expect(isStalePendingTurn(oldUserTurn, BASE_TIME + 60 * 60 * 1000)).toBe(false);
  });

  it("is false for a complete assistant turn regardless of age", () => {
    const oldCompleteTurn = turn({ role: "assistant", status: "complete" });

    expect(isStalePendingTurn(oldCompleteTurn, BASE_TIME + 60 * 60 * 1000)).toBe(false);
  });

  it("is false for a failed assistant turn regardless of age", () => {
    const oldFailedTurn = turn({ role: "assistant", status: "failed" });

    expect(isStalePendingTurn(oldFailedTurn, BASE_TIME + 60 * 60 * 1000)).toBe(false);
  });
});

describe("draftProgressState", () => {
  it("returns drafting for a fresh trailing pending assistant turn with no snapshot anywhere", () => {
    const turns = [
      turn({ id: "t1", role: "user" }),
      turn({ id: "t2", role: "assistant", status: "pending" }),
    ];

    expect(draftProgressState(turns, BASE_TIME + 60 * 1000)).toBe("drafting");
  });

  it("returns stalled once that same trailing pending turn crosses the threshold", () => {
    const turns = [
      turn({ id: "t1", role: "user" }),
      turn({ id: "t2", role: "assistant", status: "pending" }),
    ];

    expect(draftProgressState(turns, BASE_TIME + 5 * 60 * 1000)).toBe("stalled");
  });

  it("returns idle when any turn carries a snapshot, even with a fresh trailing pending turn", () => {
    const turns = [
      turn({
        id: "t1",
        role: "assistant",
        status: "complete",
        structureSnapshot: { modules: [], strictOrder: false },
      }),
      turn({ id: "t2", role: "user" }),
      turn({ id: "t3", role: "assistant", status: "pending" }),
    ];

    expect(draftProgressState(turns, BASE_TIME + 60 * 1000)).toBe("idle");
  });

  it("returns idle for an empty turn list", () => {
    expect(draftProgressState([], BASE_TIME)).toBe("idle");
  });

  it("returns idle when the last turn is complete", () => {
    const turns = [turn({ id: "t1", role: "assistant", status: "complete" })];

    expect(draftProgressState(turns, BASE_TIME)).toBe("idle");
  });

  it("returns idle when the last turn is failed", () => {
    const turns = [turn({ id: "t1", role: "assistant", status: "failed" })];

    expect(draftProgressState(turns, BASE_TIME)).toBe("idle");
  });
});
