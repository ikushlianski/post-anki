import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({ listChatQueueMessages: vi.fn() }));
vi.mock("./knowledge-bit-chat-queue.service.js", () => ({ sendChatQueueMessage: vi.fn() }));
vi.mock("./knowledge-bit-web-tools.deps.js", () => ({ createKnowledgeBitWebTools: vi.fn() }));
vi.mock("./ask-ai-chat.repo.js", () => ({ insertAskAiChatBit: vi.fn(), countRecentAskAiChatBits: vi.fn() }));

import { ASK_AI_HOURLY_CAP, openAskAiChat, retryHeldAskAiReplies, sanitizeGapText, type AskAiChatDeps } from "./ask-ai-chat.orchestrator.js";

const WEB_DEPS = { searchWeb: vi.fn(), isCitedUrl: vi.fn(), fetchPage: vi.fn() };

function buildDeps(overrides: Partial<AskAiChatDeps> = {}): AskAiChatDeps {
  return {
    listHeldBits: vi.fn().mockResolvedValue([]),
    insertBit: vi.fn().mockResolvedValue({ id: "kbask_ks_1", created: true, active: true }),
    countRecentBits: vi.fn().mockResolvedValue(1),
    hasMessages: vi.fn().mockResolvedValue(false),
    sendMessage: vi.fn().mockResolvedValue({ ok: true, value: { reply: "r", turnsLeft: 7, capReached: false } }),
    createWebTools: vi.fn().mockReturnValue({ deps: WEB_DEPS, getSources: () => [], getUsage: () => ({ searches: 0, fetches: 0 }) }),
    ...overrides,
  };
}

describe("openAskAiChat", () => {
  it("should seed the chat with the learner's question and answer it with capped cheap web tools, the light model and no card proposals", async () => {
    const deps = buildDeps();
    const handle = await openAskAiChat("ks_1", "Why does the lock expire early?", deps);

    await handle?.reply();

    expect(deps.insertBit).toHaveBeenCalledWith("ks_1", "Why does the lock expire early?");
    expect(deps.createWebTools).toHaveBeenCalledWith(
      expect.objectContaining({ maxSearches: 2, maxPageFetches: 1, forceTier: "cheap", knowledgeBitId: "kbask_ks_1" }),
    );
    expect(deps.sendMessage).toHaveBeenCalledWith(
      "kbask_ks_1",
      { clientMessageId: "ask-ai-ks_1", message: "Why does the lock expire early?" },
      { webTools: WEB_DEPS, getWebUsage: expect.any(Function), proposalTools: false, lightModel: true },
    );
  });

  it("should not answer a second time when a retry finds the chat already answered", async () => {
    const deps = buildDeps({
      insertBit: vi.fn().mockResolvedValue({ id: "kbask_ks_1", created: false, active: true }),
      hasMessages: vi.fn().mockResolvedValue(true),
    });
    const handle = await openAskAiChat("ks_1", "Why?", deps);

    await handle?.reply();

    expect(handle?.bitId).toBe("kbask_ks_1");
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("should keep the chat visible but hold the reply once the hourly auto-chat cap is passed", async () => {
    const deps = buildDeps({ countRecentBits: vi.fn().mockResolvedValue(ASK_AI_HOURLY_CAP + 1) });
    const handle = await openAskAiChat("ks_1", "Why?", deps);

    await handle?.reply();

    expect(deps.insertBit).toHaveBeenCalledTimes(1);
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("should still answer the third chat of the hour", async () => {
    const deps = buildDeps({ countRecentBits: vi.fn().mockResolvedValue(ASK_AI_HOURLY_CAP) });
    const handle = await openAskAiChat("ks_1", "Why?", deps);

    await handle?.reply();

    expect(deps.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("should open nothing when the gap text is empty after cleaning", async () => {
    const deps = buildDeps();

    expect(await openAskAiChat("ks_1", " \n\t ", deps)).toBeNull();
    expect(deps.insertBit).not.toHaveBeenCalled();
  });
});

describe("openAskAiChat for an existing bit", () => {
  it("should return no handle when the bit already exists and left the chat state", async () => {
    const deps = buildDeps({ insertBit: vi.fn().mockResolvedValue({ id: "kbask_ks_1", created: false, active: false }) });

    expect(await openAskAiChat("ks_1", "Why?", deps)).toBeNull();
  });
});

describe("retryHeldAskAiReplies", () => {
  const held = [
    { id: "kbask_ks_1", knowledgeSourceId: "ks_1", body: "Why one?" },
    { id: "kbask_ks_2", knowledgeSourceId: "ks_2", body: "Why two?" },
  ];

  it("should answer chats whose first reply was held once the hourly cap has cleared", async () => {
    const deps = buildDeps({ listHeldBits: vi.fn().mockResolvedValue(held) });

    expect(await retryHeldAskAiReplies(deps)).toBe(2);
    expect(deps.listHeldBits).toHaveBeenCalledWith(2);
    expect(deps.sendMessage).toHaveBeenCalledTimes(2);
    expect(deps.sendMessage).toHaveBeenCalledWith(
      "kbask_ks_1",
      { clientMessageId: "ask-ai-ks_1", message: "Why one?" },
      { webTools: WEB_DEPS, getWebUsage: expect.any(Function), proposalTools: false, lightModel: true },
    );
  });

  it("should keep holding replies while the cap is still exceeded", async () => {
    const deps = buildDeps({
      listHeldBits: vi.fn().mockResolvedValue(held),
      countRecentBits: vi.fn().mockResolvedValue(ASK_AI_HOURLY_CAP + 1),
    });

    expect(await retryHeldAskAiReplies(deps)).toBe(0);
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });
});

describe("sanitizeGapText", () => {
  it("should truncate to 300 characters and drop control characters", () => {
    expect(sanitizeGapText("a\u0000b\n\nc")).toBe("a b c");
    expect(sanitizeGapText("x".repeat(500))).toHaveLength(300);
  });
});
