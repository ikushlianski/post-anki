import { describe, it, expect } from "vitest";
import { deriveSocraticAction } from "./escalation";

describe("deriveSocraticAction", () => {
  it("advances when the learner is correct, regardless of history", () => {
    expect(deriveSocraticAction({ degree: "correct", priorWrongCount: 0 })).toBe("advance");
    expect(deriveSocraticAction({ degree: "correct", priorWrongCount: 5 })).toBe("advance");
  });

  it("points out the flaw on a first slightly-wrong answer", () => {
    expect(deriveSocraticAction({ degree: "slightly_wrong", priorWrongCount: 0 })).toBe("point_out");
  });

  it("explains or hints on a first mostly-wrong answer", () => {
    expect(deriveSocraticAction({ degree: "mostly_wrong", priorWrongCount: 0 })).toBe("explain_hint");
  });

  it("gives the answer once the learner is wrong a second time", () => {
    expect(deriveSocraticAction({ degree: "slightly_wrong", priorWrongCount: 1 })).toBe("give_answer");
    expect(deriveSocraticAction({ degree: "mostly_wrong", priorWrongCount: 1 })).toBe("give_answer");
  });

  it("keeps giving the answer on the third wrong attempt", () => {
    expect(deriveSocraticAction({ degree: "mostly_wrong", priorWrongCount: 2 })).toBe("give_answer");
  });
});
