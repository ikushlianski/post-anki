import { describe, expect, it, vi } from "vitest";

vi.mock("../mastra/model.js", () => ({ resolveAgentModel: vi.fn(), dynamicKnowledgeItemModel: vi.fn() }));
vi.mock("../shared/env.js", () => ({ loadEnv: () => ({ OPENROUTER_BASE_URL: "https://example.test" }) }));
vi.mock("../shared/spend-guard.js", () => ({ assertLlmBudgetAvailable: vi.fn() }));
vi.mock("../mastra/mastra.js", () => ({ getMastra: vi.fn(), AGENT_KEYS: {} }));
vi.mock("../mastra/generate-with-retry.js", () => ({ generateWithRetry: vi.fn() }));
vi.mock("../admin-settings/admin-settings.repo.js", () => ({ getKnowledgeItemModelId: vi.fn() }));

import { CARD_PRINCIPLES_TEXT } from "./knowledge-bit-card-principles.js";
import { INSTRUCTIONS } from "../mastra/knowledge-bit-basic-card-generator.agent.js";
import { KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS } from "../mastra/knowledge-bit-chat-queue.agent.js";
import { createChatQueueProposalTools } from "../mastra/knowledge-bit-chat-queue-proposal-tools.js";
import { createChatQueueProposalSink } from "./knowledge-bit-chat-queue-proposal-sink.js";

describe("CARD_PRINCIPLES_TEXT", () => {
  it("should be the same card rules for the basic generator and the chat agent", () => {
    expect(INSTRUCTIONS).toContain(CARD_PRINCIPLES_TEXT);
    expect(KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS).toContain(CARD_PRINCIPLES_TEXT);
  });

  it("should reach the model through the proposal tool descriptions", () => {
    const tools = createChatQueueProposalTools({ sink: createChatQueueProposalSink(), allowUpdate: true });

    expect(tools.proposeNewCard.description).toContain(CARD_PRINCIPLES_TEXT);
    expect(tools.proposeCardUpdate?.description).toContain(CARD_PRINCIPLES_TEXT);
  });

  it("should tell the chat agent how to react when the learner rejects a card", () => {
    expect(KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS).toContain("acknowledge it in one sentence");
    expect(KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS).toContain("ONE short question");
  });
});
