import { describe, it, expect } from "vitest";
import { recordSessionAnswer } from "./record-session-answer";

describe("recordSessionAnswer", () => {
  it("increments the answered count and the correct count on a correct answer", () => {
    const next = recordSessionAnswer({ questionsAnswered: 2, questionsCorrect: 1 }, true);

    expect(next).toEqual({ questionsAnswered: 3, questionsCorrect: 2 });
  });

  it("increments only the answered count on a wrong answer", () => {
    const next = recordSessionAnswer({ questionsAnswered: 2, questionsCorrect: 1 }, false);

    expect(next).toEqual({ questionsAnswered: 3, questionsCorrect: 1 });
  });
});
