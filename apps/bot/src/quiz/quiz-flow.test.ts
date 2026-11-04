import { describe, expect, it, vi } from "vitest";
import type { ProbeSession, ProbeSessionQuestion } from "@post-anki/shared";

const env = vi.hoisted(() => ({ WEB_BASE_URL: "https://app.example.com/" as string | undefined }));

vi.mock("../env.js", () => ({ loadEnv: () => env }));
const editMessageText = vi.hoisted(() => vi.fn());
const getActiveProbeSession = vi.hoisted(() => vi.fn());

vi.mock("../telegram/bot.js", () => ({ editMessageText, sendChatAction: vi.fn() }));
vi.mock("../api/client.js", () => ({ getActiveProbeSession }));
const setChatContext = vi.hoisted(() => vi.fn());
vi.mock("../session/chat-context.repo.js", () => ({ setChatContext }));

import type { ChatContext } from "../session/chat-context.repo.js";
import { endKeyboard, nextQuizQuestion, questionKeyboard } from "./quiz-flow.js";

function question(type: "single" | "multi", id = "q1", order = 0): ProbeSessionQuestion {
  return {
    id,
    order,
    topicId: "t1",
    gapId: null,
    prompt: "p",
    options: ["a", "b", "c"],
    difficulty: "easy",
    format: "true_false",
    type,
    answeredIndex: null,
    answeredIndexes: null,
    outcome: null,
    correctAnswerIndex: null,
    correctAnswerIndexes: null,
    optionExplanations: null,
  };
}

const session = { scope: "topic", scopeId: "t1", curriculumId: "c1" } as ProbeSession;

describe("questionKeyboard", () => {
  it("should lay three options out in one row followed by Skip and End quiz", () => {
    const rows = questionKeyboard(question("single"), session);

    expect(rows[0]!.map((b) => b.text)).toEqual(["1", "2", "3"]);
    expect(rows[1]!.map((b) => b.text)).toEqual(["Skip", "⏹ End quiz"]);
  });

  it("should lay four options out two per row and five options three then two", () => {
    const four = { ...question("single"), options: ["a", "b", "c", "d"] };
    const five = { ...question("single"), options: ["a", "b", "c", "d", "e"] };

    expect(questionKeyboard(four, session).slice(0, 2).map((r) => r.length)).toEqual([2, 2]);
    expect(questionKeyboard(five, session).slice(0, 2).map((r) => r.length)).toEqual([3, 2]);
  });

  it("should offer a web link and Next, with no number buttons, for a multi-answer question", () => {
    const rows = questionKeyboard(question("multi"), session).flat();

    expect(rows.map((b) => b.text)).toEqual(["Open on the web", "Next →", "⏹ End quiz", "🔄 Regenerate quiz"]);
    expect(rows[0]).toMatchObject({ url: "https://app.example.com/probe/t1" });
  });

  it("should leave out the web link when no web address is configured", () => {
    env.WEB_BASE_URL = undefined;

    const texts = questionKeyboard(question("multi"), session).flat().map((b) => b.text);

    expect(texts).toEqual(["Next →", "⏹ End quiz", "🔄 Regenerate quiz"]);
    env.WEB_BASE_URL = "https://app.example.com/";
  });
});

describe("endKeyboard", () => {
  it("should offer New quiz for the same scope and Home when a quiz ends", () => {
    const [row] = endKeyboard("module");

    expect(row?.map((b) => b.text)).toEqual(["🔄 New quiz", "🏠 Home"]);
  });
});

describe("nextQuizQuestion", () => {
  const context = { scopeKind: "topic", scopeId: "t1", currentItemId: "q1", label: "L" } as ChatContext;

  it("should move past an unanswered multi-answer question to the following one", async () => {
    getActiveProbeSession.mockResolvedValue({
      ...session,
      total: 2,
      correct: 0,
      answered: 0,
      questions: [question("multi", "q1", 0), question("single", "q2", 1)],
    });
    env.WEB_BASE_URL = undefined;
    editMessageText.mockClear();

    await nextQuizQuestion(1, 2, context);

    expect(editMessageText.mock.calls[0]![2]).toContain("p");
    expect(editMessageText.mock.calls[0]![3].flat().map((b: { text: string }) => b.text)).toContain("1");
    env.WEB_BASE_URL = "https://app.example.com/";
  });

  it("should finish with New quiz and Home when only the skipped multi-answer question is left", async () => {
    getActiveProbeSession.mockResolvedValue({
      ...session,
      total: 1,
      correct: 0,
      answered: 0,
      questions: [question("multi", "q1", 0)],
    });
    editMessageText.mockClear();

    await nextQuizQuestion(1, 2, context);

    expect(editMessageText.mock.calls[0]![2]).toContain("No more questions");
    expect(editMessageText.mock.calls[0]![3].flat().map((b: { text: string }) => b.text)).toEqual([
      "🔄 New quiz",
      "🏠 Home",
    ]);
  });
});

describe("skipping a question", () => {
  const context = { scopeKind: "topic", scopeId: "t1", currentItemId: "q1", label: "L" } as ChatContext;

  it("should move to the next question without grading the skipped one", async () => {
    getActiveProbeSession.mockResolvedValue({
      ...session,
      total: 2,
      correct: 0,
      answered: 0,
      questions: [question("single", "q1", 0), question("single", "q2", 1)],
    });
    editMessageText.mockClear();

    await nextQuizQuestion(1, 2, context);

    expect(editMessageText.mock.calls[0]![2]).toContain("p");
    expect(setChatContext).toHaveBeenCalledWith(1, expect.objectContaining({ currentItemId: "q2" }));
  });
});

