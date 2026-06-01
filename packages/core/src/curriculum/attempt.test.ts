import { describe, it, expect } from "vitest";
import type { Question, RecordAttemptInput, TopicProgress } from "@post-anki/shared";
import { gradeAttempt, applyAttempt } from "./attempt";

const quickTest: Question = {
  id: "q1",
  topicId: "t1",
  kind: "quick_test",
  prompt: "pick one",
  options: ["a", "b", "c"],
  correctAnswerIndex: 1,
};

const socratic: Question = {
  id: "q2",
  topicId: "t1",
  kind: "socratic",
  prompt: "reason it through",
};

const fresh: TopicProgress = {
  status: "not_started",
  maturity: 0,
  attempts: 0,
  lastInteractedAt: null,
};

function attempt(overrides: Partial<RecordAttemptInput>): RecordAttemptInput {
  return {
    topicId: "t1",
    questionId: "q1",
    mode: "quick_test",
    answer: "",
    ...overrides,
  };
}

describe("gradeAttempt", () => {
  it("passes a quick test when the chosen option is correct", () => {
    expect(gradeAttempt(quickTest, attempt({ answer: "1" }))).toBe("pass");
  });

  it("fails a quick test when the chosen option is wrong", () => {
    expect(gradeAttempt(quickTest, attempt({ answer: "0" }))).toBe("fail");
  });

  it("defers to the learner's honest self-verdict on a socratic answer", () => {
    expect(
      gradeAttempt(socratic, attempt({ mode: "socratic", selfOutcome: "pass" })),
    ).toBe("pass");
  });

  it("treats an unjudged socratic answer as not yet passed", () => {
    expect(gradeAttempt(socratic, attempt({ mode: "socratic" }))).toBe("fail");
  });
});

describe("applyAttempt", () => {
  it("raises maturity and records the interaction time on a pass", () => {
    const next = applyAttempt(fresh, "pass", "now");

    expect(next.maturity).toBe(25);
    expect(next.attempts).toBe(1);
    expect(next.lastInteractedAt).toBe("now");
  });

  it("never lets maturity fall below zero on repeated failure", () => {
    const next = applyAttempt(fresh, "fail", "now");

    expect(next.maturity).toBe(0);
    expect(next.attempts).toBe(1);
  });

  it("never lets maturity exceed one hundred", () => {
    const high: TopicProgress = { status: "in_progress", maturity: 90, attempts: 4, lastInteractedAt: "t" };

    expect(applyAttempt(high, "pass", "now").maturity).toBe(100);
  });
});
