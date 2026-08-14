import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerSocraticResult, CompleteSocraticSessionResult } from "@post-anki/shared";
import type { ChatContext } from "../session/chat-context.repo.js";

const editMessageText = vi.fn();
const sendChatAction = vi.fn();
const sendMessage = vi.fn();
const sendMessageWithKeyboard = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  editMessageText: (...a: unknown[]) => editMessageText(...a),
  sendChatAction: (...a: unknown[]) => sendChatAction(...a),
  sendMessage: (...a: unknown[]) => sendMessage(...a),
  sendMessageWithKeyboard: (...a: unknown[]) => sendMessageWithKeyboard(...a),
}));

const answerSocraticSession = vi.fn();
const startSocraticSession = vi.fn();
const completeSocraticSessionNow = vi.fn();

vi.mock("../api/client.js", () => ({
  answerSocraticSession: (...a: unknown[]) => answerSocraticSession(...a),
  startSocraticSession: (...a: unknown[]) => startSocraticSession(...a),
  completeSocraticSessionNow: (...a: unknown[]) => completeSocraticSessionNow(...a),
}));

const setChatContext = vi.fn();
const clearChatContext = vi.fn();

vi.mock("../session/chat-context.repo.js", () => ({
  setChatContext: (...a: unknown[]) => setChatContext(...a),
  clearChatContext: (...a: unknown[]) => clearChatContext(...a),
}));

const { answerSocratic, endSocratic } = await import("./socratic-flow.js");

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

function baseAnswerResult(over: Partial<AnswerSocraticResult> = {}): AnswerSocraticResult {
  return {
    action: "advance",
    degree: "correct",
    feedback: "Right — that holds up.",
    conceptLabel: "Loaders",
    covered: true,
    next: { id: "turn2", gapId: "g2", conceptLabel: "Server functions", prompt: "Explain it.", order: 2 },
    status: "active",
    conceptsCovered: 1,
    conceptsTotal: 5,
    topicMaturity: 40,
    checkpointReached: false,
    checkpointSummary: null,
    ...over,
  };
}

describe("answerSocratic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the normal next-question text when no checkpoint fires", async () => {
    answerSocraticSession.mockResolvedValue(baseAnswerResult());

    await answerSocratic(CHAT_ID, baseContext(), "my answer");

    expect(sendMessageWithKeyboard).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(setChatContext).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ currentItemId: "turn2" }),
    );
  });

  it("renders the checkpoint summary with the checkpoint keyboard instead of the normal next-question text (AC 10)", async () => {
    answerSocraticSession.mockResolvedValue(
      baseAnswerResult({
        checkpointReached: true,
        checkpointSummary: {
          topicTitle: "TanStack Start",
          depth: "working",
          solidConcepts: ["Loaders", "Server functions"],
          mostRecentGap: null,
          gapsLoggedCount: 0,
          crossCuttingConcerns: [],
          exchangeCount: 5,
          topicMaturity: 40,
        },
      }),
    );

    await answerSocratic(CHAT_ID, baseContext(), "my answer");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendMessageWithKeyboard).toHaveBeenCalledOnce();
    const [chatId, text, keyboard] = sendMessageWithKeyboard.mock.calls[0]!;
    expect(chatId).toBe(CHAT_ID);
    expect(text).toContain("Session summary");
    expect(text).toContain("Loaders");
    expect(keyboard.flat()).toHaveLength(1);
    expect(keyboard.flat()[0].text).toContain("Continue now");
  });

  it("sets chat context identically to a normal answer on a checkpoint turn — only the message/keyboard differ (AC 11)", async () => {
    answerSocraticSession.mockResolvedValue(
      baseAnswerResult({
        checkpointReached: true,
        checkpointSummary: {
          topicTitle: "TanStack Start",
          depth: "working",
          solidConcepts: [],
          mostRecentGap: null,
          gapsLoggedCount: 0,
          crossCuttingConcerns: [],
          exchangeCount: 5,
          topicMaturity: 40,
        },
      }),
    );

    await answerSocratic(CHAT_ID, baseContext(), "my answer");

    expect(setChatContext).toHaveBeenCalledWith(CHAT_ID, {
      ...baseContext(),
      currentItemId: "turn2",
    });
  });

  it("clears chat context to idle and renders completion text when the session naturally completes", async () => {
    answerSocraticSession.mockResolvedValue(
      baseAnswerResult({ next: null, status: "completed" }),
    );

    await answerSocratic(CHAT_ID, baseContext(), "my answer");

    expect(setChatContext).toHaveBeenCalledWith(CHAT_ID, {
      ...baseContext(),
      mode: "idle",
      sessionId: null,
      currentItemId: null,
    });
    expect(sendMessageWithKeyboard).not.toHaveBeenCalled();
  });
});

describe("endSocratic (/done — issue #27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the summary then unconditionally clears chat context when this call wins the completion race (AC 4)", async () => {
    const result: CompleteSocraticSessionResult = {
      completed: true,
      summary: {
        topicTitle: "TanStack Start",
        depth: "working",
        solidConcepts: ["Loaders"],
        mostRecentGap: null,
        gapsLoggedCount: 0,
        crossCuttingConcerns: [],
        exchangeCount: 3,
        topicMaturity: 40,
      },
    };
    completeSocraticSessionNow.mockResolvedValue(result);

    await endSocratic(CHAT_ID, baseContext());

    expect(completeSocraticSessionNow).toHaveBeenCalledWith("ss1");
    expect(sendMessage).toHaveBeenCalledOnce();
    expect((sendMessage.mock.calls[0]![1] as string)).toContain("Solid session — no new gaps logged.");
    expect(clearChatContext).toHaveBeenCalledWith(CHAT_ID);
  });

  it("sends no summary but still clears chat context when the session had zero exchanges (AC 30)", async () => {
    completeSocraticSessionNow.mockResolvedValue({ completed: true, summary: null });

    await endSocratic(CHAT_ID, baseContext());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(clearChatContext).toHaveBeenCalledWith(CHAT_ID);
  });

  it("sends nothing but still clears chat context when this call loses the race to a concurrent sweep", async () => {
    completeSocraticSessionNow.mockResolvedValue({ completed: false, summary: null });

    await endSocratic(CHAT_ID, baseContext());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(clearChatContext).toHaveBeenCalledWith(CHAT_ID);
  });

  it("does nothing when there is no active session id", async () => {
    await endSocratic(CHAT_ID, baseContext({ sessionId: null }));

    expect(completeSocraticSessionNow).not.toHaveBeenCalled();
    expect(clearChatContext).not.toHaveBeenCalled();
  });
});
