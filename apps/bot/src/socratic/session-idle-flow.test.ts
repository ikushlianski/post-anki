import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SocraticSessionSummary } from "@post-anki/shared";

const sendMessage = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  sendMessage: (chatId: number, text: string) => sendMessage(chatId, text),
}));

const checkSocraticSessionIdle = vi.fn();

vi.mock("../api/client.js", () => ({
  checkSocraticSessionIdle: (sessionId: string) => checkSocraticSessionIdle(sessionId),
}));

const getChatContext = vi.fn();
const clearChatContext = vi.fn();

vi.mock("../session/chat-context.repo.js", () => ({
  getChatContext: (chatId: number) => getChatContext(chatId),
  clearChatContext: (chatId: number) => clearChatContext(chatId),
}));

const { runSessionIdleSweep } = await import("./session-idle-flow.js");

const OWNER = 42;

function makeSummary(over: Partial<SocraticSessionSummary> = {}): SocraticSessionSummary {
  return {
    topicTitle: "TanStack Start",
    depth: "working",
    solidConcepts: ["Loaders"],
    mostRecentGap: null,
    gapsLoggedCount: 0,
    crossCuttingConcerns: [],
    exchangeCount: 3,
    topicMaturity: 40,
    ...over,
  };
}

describe("runSessionIdleSweep (issue #27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when the owner chat has no chat_context row (AC 22)", async () => {
    getChatContext.mockResolvedValue(null);

    await runSessionIdleSweep(OWNER);

    expect(checkSocraticSessionIdle).not.toHaveBeenCalled();
  });

  it("does nothing when the mode is not socratic (AC 22)", async () => {
    getChatContext.mockResolvedValue({
      mode: "quiz",
      sessionId: "ps1",
      currentItemId: "q1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });

    await runSessionIdleSweep(OWNER);

    expect(checkSocraticSessionIdle).not.toHaveBeenCalled();
  });

  it("does nothing when mode is socratic but sessionId is null (AC 22)", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: null,
      currentItemId: null,
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });

    await runSessionIdleSweep(OWNER);

    expect(checkSocraticSessionIdle).not.toHaveBeenCalled();
  });

  it("sends the summary then clears chat context, in that order, when the session is idle (AC 23)", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });
    checkSocraticSessionIdle.mockResolvedValue({ idle: true, summary: makeSummary() });

    const callOrder: string[] = [];
    sendMessage.mockImplementation(async () => {
      callOrder.push("sendMessage");
    });
    clearChatContext.mockImplementation(async () => {
      callOrder.push("clearChatContext");
    });

    await runSessionIdleSweep(OWNER);

    expect(sendMessage).toHaveBeenCalledOnce();
    expect((sendMessage.mock.calls[0]![1] as string)).toContain("TanStack Start");
    expect(clearChatContext).toHaveBeenCalledWith(OWNER);
    expect(callOrder).toEqual(["sendMessage", "clearChatContext"]);
  });

  it("clears chat context without sending a message when the session completed with zero exchanges (AC 30)", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });
    checkSocraticSessionIdle.mockResolvedValue({ idle: true, summary: null });

    await runSessionIdleSweep(OWNER);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(clearChatContext).toHaveBeenCalledWith(OWNER);
  });

  it("does nothing when the session is not idle yet", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });
    checkSocraticSessionIdle.mockResolvedValue({ idle: false });

    await runSessionIdleSweep(OWNER);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(clearChatContext).not.toHaveBeenCalled();
  });
});
