import { describe, expect, it } from "vitest";
import { scoreQuickTestSelection } from "./score-quick-test";

describe("scoreQuickTestSelection", () => {
  it("scores pass when the picked index matches the correct answer", () => {
    expect(scoreQuickTestSelection({ correctAnswerIndex: 1, gapId: "g1" }, 1)).toBe("pass");
  });

  it("scores fail when the picked index doesn't match the correct answer", () => {
    expect(scoreQuickTestSelection({ correctAnswerIndex: 1, gapId: "g1" }, 0)).toBe("fail");
  });

  it("scores fail when the question has no correct answer index to compare against", () => {
    expect(scoreQuickTestSelection({ correctAnswerIndex: null, gapId: "g1" }, 0)).toBe("fail");
    expect(scoreQuickTestSelection({ correctAnswerIndex: undefined, gapId: "g1" }, 0)).toBe("fail");
  });

  it("reports no outcome for the opening question, which has no gap yet", () => {
    expect(scoreQuickTestSelection({ correctAnswerIndex: 1, gapId: null }, 1)).toBeUndefined();
  });
});
