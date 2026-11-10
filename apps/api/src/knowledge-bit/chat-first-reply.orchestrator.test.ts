import { beforeEach, describe, expect, it, vi } from "vitest";

const loadChatCardContext = vi.fn();
const listChatQueueMessages = vi.fn();
const sendChatQueueMessage = vi.fn();
const clearChatFirstPromptIf = vi.fn();

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  loadChatCardContext: (...args: unknown[]) => loadChatCardContext(...args),
  clearChatFirstPromptIf: (...args: unknown[]) => clearChatFirstPromptIf(...args),
}));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({
  listChatQueueMessages: (...args: unknown[]) => listChatQueueMessages(...args),
}));
vi.mock("./knowledge-bit-chat-queue.service.js", () => ({
  sendChatQueueMessage: (...args: unknown[]) => sendChatQueueMessage(...args),
}));
vi.mock("./knowledge-bit-chat-queue-web-tools.js", () => ({
  createChatQueueWebTools: () => ({ deps: { tag: "web" }, getUsage: () => ({ searches: 0, fetches: 0 }) }),
}));

const { answerFirstChatPrompt } = await import("./chat-first-reply.orchestrator.js");

beforeEach(() => {
  vi.resetAllMocks();
  loadChatCardContext.mockResolvedValue({ approvalState: "chat", chatFirstPrompt: "Why?", sourceUrl: null });
  listChatQueueMessages.mockResolvedValue([]);
  sendChatQueueMessage.mockResolvedValue({ ok: true, value: {} });
});

describe("answerFirstChatPrompt", () => {
  it("should answer the stored prompt once under a stable message id", async () => {
    await answerFirstChatPrompt("kb1");

    expect(sendChatQueueMessage).toHaveBeenCalledTimes(1);
    expect(sendChatQueueMessage).toHaveBeenCalledWith(
      "kb1",
      { clientMessageId: "first-kb1", message: "Why?" },
      expect.objectContaining({ firstPrompt: true }),
    );
  });

  it("should skip when the prompt was already cleared", async () => {
    loadChatCardContext.mockResolvedValue({ approvalState: "chat", chatFirstPrompt: null });

    await answerFirstChatPrompt("kb1");

    expect(sendChatQueueMessage).not.toHaveBeenCalled();
  });

  it("should skip when the user already chatted so no stray reply appears", async () => {
    listChatQueueMessages.mockResolvedValue([{ seq: 1 }]);

    await answerFirstChatPrompt("kb1");

    expect(sendChatQueueMessage).not.toHaveBeenCalled();
  });

  it("should skip when the card is no longer in chat", async () => {
    loadChatCardContext.mockResolvedValue({ approvalState: "pending", chatFirstPrompt: "Why?" });

    await answerFirstChatPrompt("kb1");

    expect(sendChatQueueMessage).not.toHaveBeenCalled();
  });

  it("should release the waiting prompt when the reply fails so the chat stops showing Thinking", async () => {
    sendChatQueueMessage.mockResolvedValue({ ok: false, error: "budget_paused" });

    await expect(answerFirstChatPrompt("kb1")).resolves.toBeUndefined();
    expect(clearChatFirstPromptIf).toHaveBeenCalledWith("kb1", "Why?");
  });

  it("should keep the waiting prompt when the reply succeeds", async () => {
    await answerFirstChatPrompt("kb1");

    expect(clearChatFirstPromptIf).not.toHaveBeenCalled();
  });
});
