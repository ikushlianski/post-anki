import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const loadChatCardContext = vi.fn();
const lockChatState = vi.fn();
const lockChatFirstPrompt = vi.fn();
const clearChatFirstPrompt = vi.fn();
const listChatQueueMessages = vi.fn();
const insertChatTurn = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { knowledgeBitChatQueue: "knowledgeBitChatQueue" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
  startTracingSpan: () => undefined,
}));
vi.mock("../mastra/generate-with-retry.js", async (importActual) => ({
  ...(await importActual<typeof import("../mastra/generate-with-retry.js")>()),
  generateWithRetry: (_o: string, _c: unknown, _k: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({
  getDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({}) }),
}));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({ countRecentLlmCallEventsByOp: async () => 0 }));
vi.mock("../shared/spend-guard.js", () => ({
  LlmBudgetExceededError: class extends Error {},
  LlmBudgetCheckUnavailableError: class extends Error {},
  assertLlmBudgetAvailable: async () => undefined,
}));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  loadChatCardContext: (...args: unknown[]) => loadChatCardContext(...args),
  lockChatState: (...args: unknown[]) => lockChatState(...args),
  lockChatFirstPrompt: (...args: unknown[]) => lockChatFirstPrompt(...args),
  clearChatFirstPrompt: (...args: unknown[]) => clearChatFirstPrompt(...args),
}));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", async () => {
  const actual = await vi.importActual<typeof import("./knowledge-bit-chat-queue-messages.repo.js")>(
    "./knowledge-bit-chat-queue-messages.repo.js",
  );

  return {
    ...actual,
    listChatQueueMessages: (...args: unknown[]) => listChatQueueMessages(...args),
    insertChatTurn: (...args: unknown[]) => insertChatTurn(...args),
  };
});

const { sendChatQueueMessage, getChatQueueThread } = await import("./knowledge-bit-chat-queue.service.js");

const input = { clientMessageId: "first-kb1", message: "Why this card?" };

beforeEach(() => {
  vi.resetAllMocks();
  loadChatCardContext.mockResolvedValue({
    body: "Card",
    background: null,
    approvalState: "chat",
    sourceText: null,
    chatFirstPrompt: "Why this card?",
  });
  listChatQueueMessages.mockResolvedValue([]);
  lockChatState.mockResolvedValue("chat");
  lockChatFirstPrompt.mockResolvedValue("Why this card?");
  insertChatTurn.mockResolvedValue(2);
  generate.mockResolvedValue({ text: "Because.", usage: { inputTokens: 1, outputTokens: 1 } });
});

describe("first chat prompt reply", () => {
  it("should clear the waiting prompt in the same save as the reply", async () => {
    const result = await sendChatQueueMessage("kb1", input, { firstPrompt: true });

    expect(result.ok).toBe(true);
    expect(insertChatTurn).toHaveBeenCalledTimes(1);
    expect(clearChatFirstPrompt).toHaveBeenCalledTimes(1);
  });

  it("should drop the reply when the chat was cancelled while the model was answering", async () => {
    lockChatFirstPrompt.mockResolvedValue(null);

    const result = await sendChatQueueMessage("kb1", input, { firstPrompt: true });

    expect(result).toEqual({ ok: false, error: "not_in_chat" });
    expect(insertChatTurn).not.toHaveBeenCalled();
  });

  it("should drop the reply when the user re-sent the card with a different prompt meanwhile", async () => {
    lockChatFirstPrompt.mockResolvedValue("A newer question");

    const result = await sendChatQueueMessage("kb1", input, { firstPrompt: true });

    expect(result).toEqual({ ok: false, error: "not_in_chat" });
    expect(insertChatTurn).not.toHaveBeenCalled();
    expect(clearChatFirstPrompt).not.toHaveBeenCalled();
  });

  it("should drop the reply when the card went back to triage while the model was answering", async () => {
    lockChatState.mockResolvedValue("pending");

    const result = await sendChatQueueMessage("kb1", input, { firstPrompt: true });

    expect(result.ok).toBe(false);
    expect(insertChatTurn).not.toHaveBeenCalled();
  });

  it("should clear a waiting prompt when the user types their own message first", async () => {
    lockChatFirstPrompt.mockResolvedValue(null);

    const result = await sendChatQueueMessage("kb1", { clientMessageId: "u1", message: "hello" });

    expect(result.ok).toBe(true);
    expect(clearChatFirstPrompt).toHaveBeenCalledTimes(1);
  });
});

describe("getChatQueueThread with a waiting prompt", () => {
  it("should show the waiting prompt while the thread has no messages", async () => {
    const result = await getChatQueueThread("kb1");

    expect(result.ok && result.value.pendingPrompt).toBe("Why this card?");
  });

  it("should not show a leftover prompt on a card that is no longer in chat", async () => {
    loadChatCardContext.mockResolvedValue({ body: "Card", background: null, approvalState: "approved", sourceText: null, chatFirstPrompt: "Old" });

    const result = await getChatQueueThread("kb1");

    expect(result.ok && result.value.pendingPrompt).toBeUndefined();
  });

  it("should hide the waiting prompt once the reply is stored", async () => {
    listChatQueueMessages.mockResolvedValue([
      { seq: 1, role: "user", text: "Why this card?", createdAt: "t", clientMessageId: "first-kb1" },
      { seq: 2, role: "assistant", text: "Because.", createdAt: "t", clientMessageId: null },
    ]);

    const result = await getChatQueueThread("kb1");

    expect(result.ok && result.value.pendingPrompt).toBeUndefined();
  });
});
