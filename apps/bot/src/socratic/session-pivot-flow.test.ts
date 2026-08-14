import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteSocraticSessionResult } from "@post-anki/shared";
import type { ChatContext } from "../session/chat-context.repo.js";
import type { TopicCandidate } from "./topic-match.js";

const completeSocraticSessionNow = vi.fn();

vi.mock("../api/client.js", () => ({
  completeSocraticSessionNow: (...a: unknown[]) => completeSocraticSessionNow(...a),
}));

const sendMessage = vi.fn();
const sendMessageWithKeyboard = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  sendMessage: (...a: unknown[]) => sendMessage(...a),
  sendMessageWithKeyboard: (...a: unknown[]) => sendMessageWithKeyboard(...a),
}));

const clearChatContext = vi.fn();
const setNavCurriculum = vi.fn();

vi.mock("../session/chat-context.repo.js", () => ({
  clearChatContext: (...a: unknown[]) => clearChatContext(...a),
  setNavCurriculum: (...a: unknown[]) => setNavCurriculum(...a),
}));

const startQuiz = vi.fn();

vi.mock("../quiz/quiz-flow.js", () => ({
  startQuiz: (...a: unknown[]) => startQuiz(...a),
}));

const startSocratic = vi.fn();

vi.mock("./socratic-flow.js", () => ({
  startSocratic: (...a: unknown[]) => startSocratic(...a),
}));

const isSteerShaped = vi.fn();
const findRegisteredTopic = vi.fn();

vi.mock("./topic-match.js", () => ({
  isSteerShaped: (...a: unknown[]) => isSteerShaped(...a),
  findRegisteredTopic: (...a: unknown[]) => findRegisteredTopic(...a),
}));

const { finalizeForPivot, finalizeForSkip, steerToTopic } = await import("./session-pivot-flow.js");

const CHAT_ID = 42;

function baseContext(over: Partial<ChatContext> = {}): ChatContext {
  return {
    mode: "socratic",
    sessionId: "ss1",
    currentItemId: "turn1",
    scopeKind: "topic",
    scopeId: "t1",
    navCurriculumId: "c1",
    label: "TanStack Start",
    messageId: 5,
    ...over,
  };
}

function completeResult(over: Partial<CompleteSocraticSessionResult> = {}): CompleteSocraticSessionResult {
  return {
    completed: true,
    summary: {
      topicTitle: "TanStack Start",
      depth: "working",
      solidConcepts: ["Loaders"],
      mostRecentGap: null,
      gapsLoggedCount: 0,
      crossCuttingConcerns: [],
      exchangeCount: 6,
      topicMaturity: 40,
    },
    ...over,
  };
}

describe("finalizeForPivot (AC 1, 4, 5, 6, 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing and returns a silent result when there is no active session", async () => {
    const result = await finalizeForPivot(baseContext({ sessionId: null }), "AWS Lambda");

    expect(completeSocraticSessionNow).not.toHaveBeenCalled();
    expect(result).toEqual({ notice: null });
  });

  it("calls completeSocraticSessionNow with the old session's id (AC 4)", async () => {
    completeSocraticSessionNow.mockResolvedValue(completeResult());

    await finalizeForPivot(baseContext({ sessionId: "ss1" }), "AWS Lambda");

    expect(completeSocraticSessionNow).toHaveBeenCalledWith("ss1");
  });

  it("returns a switching notice when exchangeCount is 2 or more (AC 5)", async () => {
    completeSocraticSessionNow.mockResolvedValue(
      completeResult({ summary: { ...completeResult().summary!, exchangeCount: 2 } }),
    );

    const result = await finalizeForPivot(baseContext(), "AWS Lambda");

    expect(result).toEqual({
      notice: "Switching to AWS Lambda. Saving your TanStack Start progress.",
    });
  });

  it("stays silent when exchangeCount is 1 (AC 6)", async () => {
    completeSocraticSessionNow.mockResolvedValue(
      completeResult({ summary: { ...completeResult().summary!, exchangeCount: 1 } }),
    );

    expect(await finalizeForPivot(baseContext(), "AWS Lambda")).toEqual({ notice: null });
  });

  it("stays silent when summary is null, the exchangeCount === 0 suppression case (AC 6)", async () => {
    completeSocraticSessionNow.mockResolvedValue({ completed: true, summary: null });

    expect(await finalizeForPivot(baseContext(), "AWS Lambda")).toEqual({ notice: null });
  });

  it("stays silent and does not block the pivot when the finalize call loses the CAS race (AC 7)", async () => {
    completeSocraticSessionNow.mockResolvedValue({ completed: false, summary: null });

    expect(await finalizeForPivot(baseContext(), "AWS Lambda")).toEqual({ notice: null });
  });
});

describe("finalizeForSkip (AC 19, 20, skip's shared threshold with finalizeForPivot)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends one message with the saved-progress note appended when exchangeCount >= 2, then clears chat context", async () => {
    completeSocraticSessionNow.mockResolvedValue(completeResult());

    await finalizeForSkip(CHAT_ID, baseContext());

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      "No problem — I'll skip this one. Saved your TanStack Start progress.",
    );
    expect(clearChatContext).toHaveBeenCalledWith(CHAT_ID);
  });

  it("sends the bare acknowledgment with no save note when exchangeCount is 0 or 1", async () => {
    completeSocraticSessionNow.mockResolvedValue(
      completeResult({ summary: { ...completeResult().summary!, exchangeCount: 1 } }),
    );

    await finalizeForSkip(CHAT_ID, baseContext());

    expect(sendMessage).toHaveBeenCalledWith(CHAT_ID, "No problem — I'll skip this one.");
  });

  it("sends the bare acknowledgment and still clears context when there is no active session", async () => {
    await finalizeForSkip(CHAT_ID, baseContext({ sessionId: null }));

    expect(completeSocraticSessionNow).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(CHAT_ID, "No problem — I'll skip this one.");
    expect(clearChatContext).toHaveBeenCalledWith(CHAT_ID);
  });

  it("never starts a new session — the behavioral line that separates skip from a pivot", async () => {
    completeSocraticSessionNow.mockResolvedValue(completeResult());

    await finalizeForSkip(CHAT_ID, baseContext());

    expect(startQuiz).not.toHaveBeenCalled();
    expect(startSocratic).not.toHaveBeenCalled();
  });
});

describe("steerToTopic (AC 10, 11, 13, 14, 15, 16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false with zero I/O when the text is not steer-shaped (AC 11, 18)", async () => {
    isSteerShaped.mockReturnValue(false);

    const result = await steerToTopic(CHAT_ID, baseContext(), "a whole sentence, with commas.");

    expect(result).toBe(false);
    expect(findRegisteredTopic).not.toHaveBeenCalled();
    expect(completeSocraticSessionNow).not.toHaveBeenCalled();
    expect(sendMessageWithKeyboard).not.toHaveBeenCalled();
  });

  it("returns false when steer-shaped text matches no registered topic (AC 16)", async () => {
    isSteerShaped.mockReturnValue(true);
    findRegisteredTopic.mockResolvedValue(null);

    const result = await steerToTopic(CHAT_ID, baseContext(), "quantum stuff");

    expect(result).toBe(false);
    expect(completeSocraticSessionNow).not.toHaveBeenCalled();
  });

  it("returns false and never finalizes when the matched topic is the one already under discussion (mirrors dispatcher.ts's AC 2 guard)", async () => {
    const match: TopicCandidate = {
      topicId: "t1",
      curriculumId: "c1",
      title: "TanStack Start",
      topicStatus: "in_progress",
    };

    isSteerShaped.mockReturnValue(true);
    findRegisteredTopic.mockResolvedValue(match);

    const result = await steerToTopic(CHAT_ID, baseContext({ scopeId: "t1" }), "tanstack keeps state fresh");

    expect(result).toBe(false);
    expect(completeSocraticSessionNow).not.toHaveBeenCalled();
    expect(sendMessageWithKeyboard).not.toHaveBeenCalled();
    expect(startSocratic).not.toHaveBeenCalled();
  });

  it("finalizes the old session, sends the ack via sendMessageWithKeyboard, and starts the matched topic (AC 13, 14)", async () => {
    const match: TopicCandidate = {
      topicId: "lam",
      curriculumId: "c2",
      title: "AWS Lambda",
      topicStatus: "in_progress",
    };

    isSteerShaped.mockReturnValue(true);
    findRegisteredTopic.mockResolvedValue(match);
    completeSocraticSessionNow.mockResolvedValue(completeResult());
    sendMessageWithKeyboard.mockResolvedValue(99);

    const result = await steerToTopic(CHAT_ID, baseContext(), "lambda cold starts");

    expect(result).toBe(true);
    expect(completeSocraticSessionNow).toHaveBeenCalledWith("ss1");
    expect(sendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      "Switching to AWS Lambda. Saving your TanStack Start progress.",
    );
    expect(sendMessageWithKeyboard).toHaveBeenCalledWith(
      CHAT_ID,
      "Sure — let's talk about AWS Lambda.",
      [],
    );
    expect(startSocratic).toHaveBeenCalledWith(CHAT_ID, 99, "lam", "AWS Lambda");
    expect(startQuiz).not.toHaveBeenCalled();
  });

  it("starts a quiz instead of a Socratic session when the matched topic has not been started", async () => {
    const match: TopicCandidate = {
      topicId: "lam",
      curriculumId: "c2",
      title: "AWS Lambda",
      topicStatus: "not_started",
    };

    isSteerShaped.mockReturnValue(true);
    findRegisteredTopic.mockResolvedValue(match);
    completeSocraticSessionNow.mockResolvedValue({ completed: false, summary: null });
    sendMessageWithKeyboard.mockResolvedValue(99);

    await steerToTopic(CHAT_ID, baseContext({ sessionId: null }), "lambda cold starts");

    expect(startQuiz).toHaveBeenCalledWith(CHAT_ID, 99, "topic", "lam", "AWS Lambda", false);
    expect(startSocratic).not.toHaveBeenCalled();
  });

  it("calls setNavCurriculum when the matched topic is in a different curriculum than the one currently browsed (AC 15)", async () => {
    const match: TopicCandidate = {
      topicId: "lam",
      curriculumId: "different-curriculum",
      title: "AWS Lambda",
      topicStatus: "in_progress",
    };

    isSteerShaped.mockReturnValue(true);
    findRegisteredTopic.mockResolvedValue(match);
    completeSocraticSessionNow.mockResolvedValue({ completed: false, summary: null });
    sendMessageWithKeyboard.mockResolvedValue(99);

    await steerToTopic(CHAT_ID, baseContext({ navCurriculumId: "c1" }), "lambda cold starts");

    expect(setNavCurriculum).toHaveBeenCalledWith(CHAT_ID, "different-curriculum");
  });

  it("does not call setNavCurriculum when the matched topic is already in the browsed curriculum", async () => {
    const match: TopicCandidate = {
      topicId: "lam",
      curriculumId: "c1",
      title: "AWS Lambda",
      topicStatus: "in_progress",
    };

    isSteerShaped.mockReturnValue(true);
    findRegisteredTopic.mockResolvedValue(match);
    completeSocraticSessionNow.mockResolvedValue({ completed: false, summary: null });
    sendMessageWithKeyboard.mockResolvedValue(99);

    await steerToTopic(CHAT_ID, baseContext({ navCurriculumId: "c1" }), "lambda cold starts");

    expect(setNavCurriculum).not.toHaveBeenCalled();
  });
});
