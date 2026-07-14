import { describe, it, expect } from "vitest";
import { countPriorWrong, deriveSocraticAction, hasPriorPartial } from "./escalation";

describe("deriveSocraticAction", () => {
  it("advances when the learner is correct, regardless of history", () => {
    expect(
      deriveSocraticAction({
        degree: "correct",
        priorWrongCount: 0,
        priorEverPartial: false,
        depth: "working",
      }),
    ).toBe("advance");
    expect(
      deriveSocraticAction({
        degree: "correct",
        priorWrongCount: 5,
        priorEverPartial: true,
        depth: "deep",
      }),
    ).toBe("advance");
  });

  it("points out the flaw on a first slightly-wrong answer, below the cap", () => {
    expect(
      deriveSocraticAction({
        degree: "slightly_wrong",
        priorWrongCount: 0,
        priorEverPartial: false,
        depth: "working",
      }),
    ).toBe("point_out");
  });

  it("explains or hints on a first mostly-wrong answer, below the cap", () => {
    expect(
      deriveSocraticAction({
        degree: "mostly_wrong",
        priorWrongCount: 0,
        priorEverPartial: false,
        depth: "awareness",
      }),
    ).toBe("explain_hint");
  });

  it("resolves an awareness/working-depth gap at the second wrong attempt, never partial", () => {
    expect(
      deriveSocraticAction({
        degree: "mostly_wrong",
        priorWrongCount: 1,
        priorEverPartial: false,
        depth: "working",
      }),
    ).toBe("move_on");
  });

  it("does not resolve a deep-depth gap yet at the second wrong attempt", () => {
    const action = deriveSocraticAction({
      degree: "mostly_wrong",
      priorWrongCount: 1,
      priorEverPartial: false,
      depth: "deep",
    });

    expect(action).not.toBe("move_on");
    expect(action).not.toBe("give_answer");
  });

  it("resolves a deep-depth gap at the third wrong attempt", () => {
    expect(
      deriveSocraticAction({
        degree: "mostly_wrong",
        priorWrongCount: 2,
        priorEverPartial: false,
        depth: "deep",
      }),
    ).toBe("move_on");
  });

  it("gives the answer at the cap when the learner was partially correct earlier, even if the final answer was fully wrong", () => {
    expect(
      deriveSocraticAction({
        degree: "mostly_wrong",
        priorWrongCount: 1,
        priorEverPartial: true,
        depth: "working",
      }),
    ).toBe("give_answer");
  });

  it("gives the answer when the cap-hitting answer is itself the first-ever partial one", () => {
    expect(
      deriveSocraticAction({
        degree: "slightly_wrong",
        priorWrongCount: 1,
        priorEverPartial: false,
        depth: "working",
      }),
    ).toBe("give_answer");
  });

  it("moves on without revealing when the cap is hit and the learner was never even slightly correct", () => {
    expect(
      deriveSocraticAction({
        degree: "mostly_wrong",
        priorWrongCount: 1,
        priorEverPartial: false,
        depth: "working",
      }),
    ).toBe("move_on");
  });

  it("keeps resolving past the cap rather than re-asking forever", () => {
    expect(
      deriveSocraticAction({
        degree: "mostly_wrong",
        priorWrongCount: 4,
        priorEverPartial: false,
        depth: "working",
      }),
    ).toBe("move_on");
    expect(
      deriveSocraticAction({
        degree: "mostly_wrong",
        priorWrongCount: 4,
        priorEverPartial: true,
        depth: "working",
      }),
    ).toBe("give_answer");
  });
});

describe("hasPriorPartial", () => {
  it("is true when any prior turn on this gap was slightly_wrong", () => {
    const turns = [
      { gapId: "g1", degree: "mostly_wrong" },
      { gapId: "g1", degree: "slightly_wrong" },
    ];

    expect(hasPriorPartial(turns, "g1")).toBe(true);
  });

  it("is false when no prior turn on this gap was slightly_wrong", () => {
    const turns = [
      { gapId: "g1", degree: "mostly_wrong" },
      { gapId: "g1", degree: "correct" },
    ];

    expect(hasPriorPartial(turns, "g1")).toBe(false);
  });

  it("ignores turns for a different gap", () => {
    const turns = [{ gapId: "g2", degree: "slightly_wrong" }];

    expect(hasPriorPartial(turns, "g1")).toBe(false);
  });

  it("returns false for an empty turn history", () => {
    expect(hasPriorPartial([], "g1")).toBe(false);
  });
});

describe("countPriorWrong", () => {
  it("counts only wrong answers for the given concept", () => {
    const turns = [
      { gapId: "g1", degree: "mostly_wrong" },
      { gapId: "g1", degree: "slightly_wrong" },
      { gapId: "g1", degree: "correct" },
      { gapId: "g2", degree: "mostly_wrong" },
    ];

    expect(countPriorWrong(turns, "g1")).toBe(2);
  });

  it("ignores unanswered turns with a null degree", () => {
    const turns = [
      { gapId: "g1", degree: null },
      { gapId: "g1", degree: "slightly_wrong" },
    ];

    expect(countPriorWrong(turns, "g1")).toBe(1);
  });

  it("returns zero when the concept has no wrong history", () => {
    expect(countPriorWrong([{ gapId: "g1", degree: "correct" }], "g1")).toBe(0);
  });
});
