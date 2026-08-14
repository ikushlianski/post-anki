import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallbackQuery } from "grammy/types";

const answerCallbackQuery = vi.fn();
const editMessageText = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  answerCallbackQuery: (...a: unknown[]) => answerCallbackQuery(...a),
  editMessageText: (...a: unknown[]) => editMessageText(...a),
}));

const getChatContext = vi.fn();
const setNavCurriculum = vi.fn();

vi.mock("../session/chat-context.repo.js", () => ({
  getChatContext: (...a: unknown[]) => getChatContext(...a),
  setNavCurriculum: (...a: unknown[]) => setNavCurriculum(...a),
}));

const startSocratic = vi.fn();

vi.mock("../socratic/socratic-flow.js", () => ({
  startSocratic: (...a: unknown[]) => startSocratic(...a),
}));

vi.mock("../quiz/quiz-flow.js", () => ({
  nextQuizQuestion: vi.fn(),
  startQuiz: vi.fn(),
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

vi.mock("../api/client.js", () => ({
  getCurriculumDetail: vi.fn(),
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
