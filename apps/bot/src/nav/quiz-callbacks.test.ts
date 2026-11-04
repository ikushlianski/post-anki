import { beforeEach, describe, expect, it, vi } from "vitest";

const editMessageText = vi.fn();
const getChatContext = vi.fn();
const startQuiz = vi.fn();
const submitQuizAnswer = vi.fn();
const nextQuizQuestion = vi.fn();
const endQuiz = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  editMessageText: (...a: unknown[]) => editMessageText(...a),
}));
vi.mock("../session/chat-context.repo.js", () => ({
  getChatContext: (...a: unknown[]) => getChatContext(...a),
}));
vi.mock("../quiz/quiz-flow.js", () => ({
  startQuiz: (...a: unknown[]) => startQuiz(...a),
  submitQuizAnswer: (...a: unknown[]) => submitQuizAnswer(...a),
  nextQuizQuestion: (...a: unknown[]) => nextQuizQuestion(...a),
}));
vi.mock("../quiz/quiz-end.js", () => ({
  endQuiz: (...a: unknown[]) => endQuiz(...a),
}));

import { STALE_QUIZ_REPLY, onAnswer, onEndQuiz, onNext, regenerateModule, regenerateTopic } from "./quiz-callbacks.js";

const quizContext = { mode: "quiz", scopeId: "s1", label: "Topic" };

function expectQuizUntouched(): void {
  expect(startQuiz).not.toHaveBeenCalled();
  expect(submitQuizAnswer).not.toHaveBeenCalled();
  expect(nextQuizQuestion).not.toHaveBeenCalled();
  expect(endQuiz).not.toHaveBeenCalled();
}

describe("quiz callbacks on stale buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show the quiz-ended reply when an answer is tapped after the session is gone", async () => {
    getChatContext.mockResolvedValue(undefined);

    await onAnswer(1, 2, "0");

    expect(editMessageText).toHaveBeenCalledWith(1, 2, STALE_QUIZ_REPLY);
    expectQuizUntouched();
  });

  it("should show the quiz-ended reply when the chat has moved out of quiz mode", async () => {
    getChatContext.mockResolvedValue({ mode: "browse" });

    await onAnswer(1, 2, "0");
    await onNext(1, 2);
    await onEndQuiz(1, 2);

    expect(editMessageText).toHaveBeenCalledTimes(3);
    expect(editMessageText).toHaveBeenNthCalledWith(3, 1, 2, STALE_QUIZ_REPLY);
    expectQuizUntouched();
  });

  it("should show the quiz-ended reply when the answer index is not a number", async () => {
    getChatContext.mockResolvedValue(quizContext);

    await onAnswer(1, 2, "abc");

    expect(editMessageText).toHaveBeenCalledWith(1, 2, STALE_QUIZ_REPLY);
    expectQuizUntouched();
  });

  it("should show the quiz-ended reply when regenerating without a stored topic or module", async () => {
    getChatContext.mockResolvedValue({ mode: "quiz" });

    await regenerateTopic(1, 2);
    await regenerateModule(1, 2);

    expect(editMessageText).toHaveBeenCalledTimes(2);
    expect(editMessageText).toHaveBeenCalledWith(1, 2, STALE_QUIZ_REPLY);
    expectQuizUntouched();
  });
});

describe("quiz callbacks on live quizzes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChatContext.mockResolvedValue(quizContext);
  });

  it("should submit the chosen answer without the stale reply", async () => {
    await onAnswer(1, 2, "1");

    expect(submitQuizAnswer).toHaveBeenCalledWith(1, 2, quizContext, 1);
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("should advance and end the quiz without the stale reply", async () => {
    await onNext(1, 2);
    await onEndQuiz(1, 2);

    expect(nextQuizQuestion).toHaveBeenCalledWith(1, 2, quizContext);
    expect(endQuiz).toHaveBeenCalledWith(1, 2, quizContext);
    expect(editMessageText).not.toHaveBeenCalled();
  });
});
