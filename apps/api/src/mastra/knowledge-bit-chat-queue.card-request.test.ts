import { Agent } from "@mastra/core/agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const modelHolder: { model: unknown } = { model: null };

vi.mock("./model.js", () => ({ resolveAgentModel: () => modelHolder.model }));
vi.mock("../shared/env.js", () => ({ loadEnv: () => ({ OPENROUTER_BASE_URL: "https://example.test" }) }));
vi.mock("../shared/spend-guard.js", () => ({ assertLlmBudgetAvailable: vi.fn() }));

const { createKnowledgeBitChatQueueAgent } = await import("./knowledge-bit-chat-queue.agent.js");
const { buildChatQueueRunOptions } = await import("../knowledge-bit/knowledge-bit-chat-queue-run-options.js");
const { createChatQueueProposalSink } = await import("../knowledge-bit/knowledge-bit-chat-queue-proposal-sink.js");

function scriptedModel(onPrompt: (prompt: string) => void) {
  let calls = 0;

  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock",
    supportedUrls: {},
    async doGenerate(options: { prompt: unknown }) {
      calls += 1;

      if (calls === 1) {
        onPrompt(JSON.stringify(options.prompt));

        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "proposeNewCard",
              input: JSON.stringify({ front: "What does a TCP handshake establish?", back: "A reliable connection" }),
            },
          ],
          finishReason: "tool-calls",
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          warnings: [],
        };
      }

      return {
        content: [{ type: "text", text: "I proposed a card; you can accept or reject it." }],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("stream not used");
    },
  };
}

describe("chat queue agent with a free-text card request", () => {
  beforeEach(() => {
    modelHolder.model = null;
  });

  it("should turn a plain 'make a card that' message into a pending proposal and tell the model the rule", async () => {
    let prompt = "";

    modelHolder.model = scriptedModel((value) => {
      prompt = value;
    });

    const sink = createChatQueueProposalSink();
    const agent: Agent = createKnowledgeBitChatQueueAgent();
    const options = buildChatQueueRunOptions({ fallback: false, sink, allowUpdate: true });

    await agent.generate(
      "<card>TCP</card>\n<learner_message>make a card that explains what a TCP handshake does</learner_message>",
      options as never,
    );

    expect(sink.list()).toEqual([
      expect.objectContaining({
        kind: "create",
        status: "pending",
        front: "What does a TCP handshake establish?",
        back: "A reliable connection",
      }),
    ]);
    expect(prompt).toContain("you MUST call proposeNewCard");
    expect(prompt).toContain("proposeNewCard");
  });
});
