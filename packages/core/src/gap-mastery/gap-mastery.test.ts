import { describe, it, expect } from "vitest";
import {
  matchExistingGapByLabel,
  rankDueGapsForQuiz,
  computeGapAttemptIsAdjacent,
  type GapMasteryDueInfo,
} from "./gap-mastery";

describe("matchExistingGapByLabel", () => {
  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const candidates = [{ id: "g1", label: "Service boundary ownership" }];

    expect(matchExistingGapByLabel(candidates, "  service BOUNDARY ownership  ")).toBe("g1");
  });

  it("returns null when no candidate matches", () => {
    expect(matchExistingGapByLabel([{ id: "g1", label: "Idempotency" }], "Race conditions")).toBeNull();
  });

  it("returns null against an empty candidate list", () => {
    expect(matchExistingGapByLabel([], "anything")).toBeNull();
  });
});

describe("rankDueGapsForQuiz", () => {
  it("always includes a gap with no mastery tracking at all", () => {
    const candidates = [{ id: "untracked" }];

    expect(rankDueGapsForQuiz(candidates, new Map(), 100)).toEqual(candidates);
  });

  it("excludes a mastery-tracked gap whose schedule has not yet arrived", () => {
    const candidates = [{ id: "g1" }];
    const mastery = new Map<string, GapMasteryDueInfo>([
      ["g1", { gapId: "g1", status: "struggling", scheduledForSequence: 20 }],
    ]);

    expect(rankDueGapsForQuiz(candidates, mastery, 10)).toEqual([]);
  });

  it("includes a mastery-tracked gap once its schedule has arrived (inclusive boundary)", () => {
    const candidates = [{ id: "g1" }];
    const mastery = new Map<string, GapMasteryDueInfo>([
      ["g1", { gapId: "g1", status: "struggling", scheduledForSequence: 10 }],
    ]);

    expect(rankDueGapsForQuiz(candidates, mastery, 10)).toEqual(candidates);
  });

  it("excludes a mastered gap even if its schedule value would otherwise match", () => {
    const candidates = [{ id: "g1" }];
    const mastery = new Map<string, GapMasteryDueInfo>([
      ["g1", { gapId: "g1", status: "mastered", scheduledForSequence: 1 }],
    ]);

    expect(rankDueGapsForQuiz(candidates, mastery, 100)).toEqual([]);
  });
});

describe("computeGapAttemptIsAdjacent", () => {
  it("is false when there is no prior correct session recorded", () => {
    expect(computeGapAttemptIsAdjacent("sess-1", null)).toBe(false);
  });

  it("is true when the current session matches the last-correct session", () => {
    expect(computeGapAttemptIsAdjacent("sess-1", "sess-1")).toBe(true);
  });

  it("is false when the current session differs from the last-correct session, regardless of ordering", () => {
    expect(computeGapAttemptIsAdjacent("sess-7", "sess-1")).toBe(false);
    expect(computeGapAttemptIsAdjacent("sess-1", "sess-7")).toBe(false);
  });
});
