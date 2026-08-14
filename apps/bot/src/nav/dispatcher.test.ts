import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallbackQuery } from "grammy/types";

const answerCallbackQuery = vi.fn();
const editMessageText = vi.fn();
const sendMessage = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  answerCallbackQuery: (...a: unknown[]) => answerCallbackQuery(...a),
  editMessageText: (...a: unknown[]) => editMessageText(...a),
  sendMessage: (...a: unknown[]) => sendMessage(...a),
}));

const getChatContext = vi.fn();
const setNavCurriculum = vi.fn();

vi.mock("../session/chat-context.repo.js", () => ({
  getChatContext: (...a: unknown[]) => getChatContext(...a),
  setNavCurriculum: (...a: unknown[]) => setNavCurriculum(...a),
}));

const startSocratic = vi.fn();
const endSocratic = vi.fn();

vi.mock("../socratic/socratic-flow.js", () => ({
  startSocratic: (...a: unknown[]) => startSocratic(...a),
  endSocratic: (...a: unknown[]) => endSocratic(...a),
}));

const finalizeForPivot = vi.fn();

vi.mock("../socratic/session-pivot-flow.js", () => ({
  finalizeForPivot: (...a: unknown[]) => finalizeForPivot(...a),
}));

const startQuiz = vi.fn();

vi.mock("../quiz/quiz-flow.js", () => ({
  nextQuizQuestion: vi.fn(),
  startQuiz: (...a: unknown[]) => startQuiz(...a),
  submitQuizAnswer: vi.fn(),
}));

vi.mock("../gap-triage/gap-triage-flow.js", () => ({
  handleCheckinCallback: vi.fn(),
  handleTriageCallback: vi.fn(),
}));

vi.mock("./menu.js", () => ({
  editScreen: vi.fn(),
  showCurricula: vi.fn(),
  showCurriculum: vi.fn(),
  showModule: vi.fn(),
  showSubjects: vi.fn(),
  showTopic: vi.fn(),
}));

vi.mock("../telegram/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const getCurriculumDetail = vi.fn();

vi.mock("../api/client.js", () => ({
  getCurriculumDetail: (...a: unknown[]) => getCurriculumDetail(...a),
}));

const { handleCallback } = await import("./dispatcher.js");

function callbackQuery(data: string): CallbackQuery {
  return {
    id: "cb1",
    from: { id: 42, is_bot: false, first_name: "x" },
    chat_instance: "ci",
    data,
    message: {
      message_id: 9,
      date: 0,
      chat: { id: 42, type: "private", first_name: "x" },
    },
  } as CallbackQuery;
}

describe("handleCallback — 'continue' reuse for the soft checkpoint's 'Continue now' button (AC 12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-enters the active socratic session via the existing onContinue -> startSocratic path, unmodified by this story", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "TanStack Start",
      messageId: 9,
    });

    await handleCallback(callbackQuery("cont"));

    expect(startSocratic).toHaveBeenCalledWith(42, 9, "t1", "TanStack Start");
  });

  it("no new callback kind or endpoint exists for this interaction — the checkpoint keyboard's callback_data parses to exactly this same 'continue' kind", async () => {
    const { parseCallback, buildCallback } = await import("./callback.js");

    expect(parseCallback(buildCallback("continue"))).toEqual({ kind: "continue", arg: "" });
  });
});

function curriculumDetail() {
  return {
    curriculum: { id: "c1", name: "Backend" },
    modules: [
      {
        id: "m1",
        title: "Cloud Fundamentals",
        topics: [
          { id: "t1", title: "TanStack Start", progress: { status: "in_progress" } },
          { id: "t2", title: "AWS Lambda", progress: { status: "in_progress" } },
        ],
      },
    ],
  };
}

describe("startTopic — menu-tap pivot pre-check (AC 1, 2, 8, 9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurriculumDetail.mockResolvedValue(curriculumDetail());
  });

  it("calls finalizeForPivot before starting a different topic while a socratic session is active (AC 1)", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "TanStack Start",
      messageId: 9,
    });
    finalizeForPivot.mockResolvedValue({
      notice: "Switching to Backend › Cloud Fundamentals › AWS Lambda. Saving your TanStack Start progress.",
    });

    await handleCallback(callbackQuery("st:t2"));

    expect(finalizeForPivot).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "ss1" }),
      "Backend › Cloud Fundamentals › AWS Lambda",
    );
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      "Switching to Backend › Cloud Fundamentals › AWS Lambda. Saving your TanStack Start progress.",
    );
    expect(startSocratic).toHaveBeenCalledWith(42, 9, "t2", "Backend › Cloud Fundamentals › AWS Lambda");
  });

  it("does not call finalizeForPivot when re-tapping the same topic id as the active session (AC 2)", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "TanStack Start",
      messageId: 9,
    });

    await handleCallback(callbackQuery("st:t1"));

    expect(finalizeForPivot).not.toHaveBeenCalled();
    expect(startSocratic).toHaveBeenCalledWith(42, 9, "t1", "Backend › Cloud Fundamentals › TanStack Start");
  });

  it("does not call finalizeForPivot while idle (AC 9)", async () => {
    getChatContext.mockResolvedValue({
      mode: "idle",
      sessionId: null,
      currentItemId: null,
      scopeKind: null,
      scopeId: null,
      navCurriculumId: "c1",
      label: null,
      messageId: null,
    });

    await handleCallback(callbackQuery("st:t2"));

    expect(finalizeForPivot).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not call finalizeForPivot mid-quiz (AC 9)", async () => {
    getChatContext.mockResolvedValue({
      mode: "quiz",
      sessionId: "ps1",
      currentItemId: "q1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "TanStack Start",
      messageId: 9,
    });

    await handleCallback(callbackQuery("st:t2"));

    expect(finalizeForPivot).not.toHaveBeenCalled();
  });

  it("stays silent (no message sent) when finalizeForPivot returns no notice, still starts the new topic (AC 6, 8)", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "TanStack Start",
      messageId: 9,
    });
    finalizeForPivot.mockResolvedValue({ notice: null });

    await handleCallback(callbackQuery("st:t2"));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(startSocratic).toHaveBeenCalled();
  });
});

describe("startModule — always finalizes an active socratic session first (AC 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurriculumDetail.mockResolvedValue(curriculumDetail());
  });

  it("calls finalizeForPivot before starting a module quiz while a socratic session is active", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "TanStack Start",
      messageId: 9,
    });
    finalizeForPivot.mockResolvedValue({ notice: null });

    await handleCallback(callbackQuery("sm:m1"));

    expect(finalizeForPivot).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "ss1" }),
      "Backend › Cloud Fundamentals",
    );
    expect(startQuiz).toHaveBeenCalledWith(42, 9, "module", "m1", "Backend › Cloud Fundamentals", false);
  });

  it("does not call finalizeForPivot while idle", async () => {
    getChatContext.mockResolvedValue({
      mode: "idle",
      sessionId: null,
      currentItemId: null,
      scopeKind: null,
      scopeId: null,
      navCurriculumId: "c1",
      label: null,
      messageId: null,
    });

    await handleCallback(callbackQuery("sm:m1"));

    expect(finalizeForPivot).not.toHaveBeenCalled();
  });
});

describe("save_for_next callback (AC 25, 26)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ends the session via endSocratic (the exact /done path) and confirms the save", async () => {
    getChatContext.mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "TanStack Start",
      messageId: 9,
    });

    await handleCallback(callbackQuery("sv"));

    expect(endSocratic).toHaveBeenCalledOnce();
    expect(editMessageText).toHaveBeenCalledWith(
      42,
      9,
      "Saved. Send /today or tap a topic to pick up later.",
    );
  });

  it("does not call endSocratic when there is no active session", async () => {
    getChatContext.mockResolvedValue({
      mode: "idle",
      sessionId: null,
      currentItemId: null,
      scopeKind: null,
      scopeId: null,
      navCurriculumId: "c1",
      label: null,
      messageId: null,
    });

    await handleCallback(callbackQuery("sv"));

    expect(endSocratic).not.toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledWith(
      42,
      9,
      "Saved. Send /today or tap a topic to pick up later.",
    );
  });
});
