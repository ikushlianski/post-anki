import { describe, it, expect } from "vitest";
import { foldTagMastery } from "./tag-mastery";

describe("foldTagMastery", () => {
  it("reports status new with masteryStage 0 when there are no attempts", () => {
    const result = foldTagMastery([]);

    expect(result.status).toBe("new");
    expect(result.masteryStage).toBe(0);
  });

  it("reaches mastered after three Ok verdicts", () => {
    const result = foldTagMastery([
      { verdict: "Ok" },
      { verdict: "Ok" },
      { verdict: "Ok" },
    ]);

    expect(result.status).toBe("mastered");
    expect(result.masteryStage).toBe(3);
  });

  it("resets to struggling with masteryStage 0 on a non-Ok verdict", () => {
    const result = foldTagMastery([
      { verdict: "Ok" },
      { verdict: "Ok" },
      { verdict: "NeedsDeepDive" },
    ]);

    expect(result.status).toBe("struggling");
    expect(result.masteryStage).toBe(0);
  });

  it("treats NeedsReview the same as any other non-Ok verdict", () => {
    const result = foldTagMastery([{ verdict: "NeedsReview" }]);

    expect(result.status).toBe("struggling");
  });

  it("folds attempts in the order given, not by any other ordering", () => {
    const strugglingFirst = foldTagMastery([
      { verdict: "NeedsDeepDive" },
      { verdict: "Ok" },
    ]);
    const okFirst = foldTagMastery([
      { verdict: "Ok" },
      { verdict: "NeedsDeepDive" },
    ]);

    expect(strugglingFirst.status).toBe("practicing");
    expect(okFirst.status).toBe("struggling");
  });
});
