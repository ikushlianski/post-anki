import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_QUEUE_MAX_USER_TURNS } from "@post-anki/shared";

const lockChatState = vi.fn();
const lockChatFirstPrompt = vi.fn();
const clearChatFirstPrompt = vi.fn();
const insertChatTurn = vi.fn();

vi.mock("../db/client.js", () => ({
  getDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({}) }),
}));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  lockChatState: (...args: unknown[]) => lockChatState(...args),
  lockChatFirstPrompt: (...args: unknown[]) => lockChatFirstPrompt(...args),
  clearChatFirstPrompt: (...args: unknown[]) => clearChatFirstPrompt(...args),
}));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({
  insertChatTurn: (...args: unknown[]) => insertChatTurn(...args),
}));

const { saveFirstPromptFailure } = await import("./chat-first-reply-failure.js");
const { BUDGET_PAUSED_REPLY, MODEL_FAILED_REPLY } = await import("./chat-queue-failure-replies.js");

beforeEach(() => {
  vi.resetAllMocks();
  lockChatState.mockResolvedValue("chat");
  lockChatFirstPrompt.mockResolvedValue("Why?");
});

describe("saveFirstPromptFailure", () => {
  it.each([
    ["model_failed", MODEL_FAILED_REPLY],
    ["budget_paused", BUDGET_PAUSED_REPLY],
  ] as const)("should save the question with a plain reply and clear the prompt on %s", async (error, reply) => {
    await saveFirstPromptFailure("kb1", "Why?", error);

    expect(clearChatFirstPrompt).toHaveBeenCalledTimes(1);
    expect(insertChatTurn).toHaveBeenCalledWith(
      "kb1",
      expect.objectContaining({ userText: "Why?", assistantText: reply }),
      expect.anything(),
    );
  });

  it("should save nothing when the prompt was already answered or the card left the chat", async () => {
    lockChatFirstPrompt.mockResolvedValue(null);

    await saveFirstPromptFailure("kb1", "Why?", "model_failed");

    expect(insertChatTurn).not.toHaveBeenCalled();
    expect(clearChatFirstPrompt).not.toHaveBeenCalled();
  });
});

describe("turn counting", () => {
  it("should not charge the learner for a failure exchange", async () => {
    const { turnsLeftFor } = await vi.importActual<typeof import("./knowledge-bit-chat-queue-messages.repo.js")>(
      "./knowledge-bit-chat-queue-messages.repo.js",
    );

    expect(
      turnsLeftFor([
        { seq: 1, role: "user", text: "Why?", createdAt: "t" },
        { seq: 2, role: "assistant", text: MODEL_FAILED_REPLY, createdAt: "t" },
        { seq: 3, role: "user", text: "Again", createdAt: "t" },
        { seq: 4, role: "assistant", text: "Because.", createdAt: "t" },
      ]),
    ).toBe(CHAT_QUEUE_MAX_USER_TURNS - 1);
  });
});
