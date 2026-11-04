import { describe, expect, it, vi } from "vitest";
import type { ProbeSession } from "@post-anki/shared";

const editMessageText = vi.hoisted(() => vi.fn());
const getActiveProbeSession = vi.hoisted(() => vi.fn());
const setChatContext = vi.hoisted(() => vi.fn());

vi.mock("../env.js", () => ({ loadEnv: () => ({}) }));
vi.mock("../telegram/bot.js", () => ({ editMessageText, sendChatAction: vi.fn() }));
vi.mock("../api/client.js", () => ({ getActiveProbeSession }));
vi.mock("../session/chat-context.repo.js", () => ({ setChatContext }));

import type { ChatContext } from "../session/chat-context.repo.js";
import { endQuiz } from "./quiz-end.js";

const session = { scope: "topic", scopeId: "t1", curriculumId: "c1" } as ProbeSession;
describe("endQuiz", () => {
  const context = { mode: "quiz", sessionId: "s1", scopeKind: "topic", scopeId: "t1", currentItemId: "q2", label: "L" } as ChatContext;

  it("should show the score so far with New quiz and Home and leave the quiz", async () => {
    getActiveProbeSession.mockResolvedValue({ ...session, total: 5, correct: 2, answered: 3, questions: [] });
    editMessageText.mockClear();
    setChatContext.mockClear();

    await endQuiz(1, 2, context);

    expect(editMessageText.mock.calls[0]![2]).toBe("⏹ Quiz ended for L. 2/3 correct, 3 of 5 answered.");
    expect(editMessageText.mock.calls[0]![3].flat().map((b: { text: string }) => b.text)).toEqual(["🔄 New quiz", "🏠 Home"]);
    expect(setChatContext).toHaveBeenCalledWith(1, expect.objectContaining({ mode: "idle", sessionId: null, currentItemId: null }));
  });

  it("should still end cleanly when the session is gone", async () => {
    getActiveProbeSession.mockResolvedValue(null);
    editMessageText.mockClear();

    await endQuiz(1, 2, context);

    expect(editMessageText.mock.calls[0]![2]).toBe("⏹ Quiz ended for L.");
  });
});
