import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createChatQueueProposalSink } from "./knowledge-bit-chat-queue-proposal-sink.js";
import {
  buildChatQueueRunOptions,
  CHAT_QUEUE_FALLBACK_MAX_STEPS,
  CHAT_QUEUE_MAX_STEPS,
  CHAT_QUEUE_TOKEN_CEILING,
  tokenCeilingReached,
} from "./knowledge-bit-chat-queue-run-options.js";

function stepsAllowed(stopWhen: Array<(state: { steps: never[] }) => boolean>): number {
  for (let count = 1; count < 100; count += 1) {
    const steps = Array.from({ length: count }, () => ({
      usage: {},
    })) as never[];

    if (stopWhen.some((check) => check({ steps }))) {
      return count;
    }
  }

  return Infinity;
}

const webTools = {
  searchWeb: vi.fn(),
  isCitedUrl: vi.fn(),
  fetchPage: vi.fn(),
};

describe("buildChatQueueRunOptions", () => {
  it("should allow search, fetch and proposal steps on the primary attempt", () => {
    const options = buildChatQueueRunOptions({
      fallback: false,
      webTools,
      sink: createChatQueueProposalSink(),
      allowUpdate: true,
    });

    expect(stepsAllowed(options.stopWhen)).toBe(CHAT_QUEUE_MAX_STEPS);
    expect(CHAT_QUEUE_MAX_STEPS).toBe(7);
    expect(options.requestContext?.get("chatQueueWebTools")).toBe(webTools);
    expect(options.requestContext?.get("chatQueueProposalTools")).toMatchObject({ allowUpdate: true });
  });

  it("should drop web tools and shrink to three steps on the cheap fallback while keeping proposals", () => {
    const options = buildChatQueueRunOptions({
      fallback: true,
      webTools,
      sink: createChatQueueProposalSink(),
      allowUpdate: true,
    });

    expect(stepsAllowed(options.stopWhen)).toBe(CHAT_QUEUE_FALLBACK_MAX_STEPS);
    expect(options.requestContext?.get("chatQueueFallback")).toBe(true);
    expect(options.requestContext?.get("chatQueueWebTools")).toBeUndefined();
    expect(options.requestContext?.get("chatQueueProposalTools")).toBeDefined();
  });

  it("should keep unattended ask-ai replies on the light model with one step per tool-less fallback", () => {
    const options = buildChatQueueRunOptions({
      fallback: true,
      lightModel: true,
      allowUpdate: false,
    });

    expect(stepsAllowed(options.stopWhen)).toBe(1);
    expect(options.requestContext?.get("chatQueueLightModel")).toBe(true);
    expect(options.requestContext?.get("chatQueueProposalTools")).toBeUndefined();
  });

  it("should add no request context when nothing is switched on", () => {
    expect(buildChatQueueRunOptions({ fallback: false, allowUpdate: false }).requestContext).toBeUndefined();
  });
});

describe("tokenCeilingReached", () => {
  it("should keep the loop going below the ceiling and stop once the steps together reach it", () => {
    const half = { usage: { totalTokens: CHAT_QUEUE_TOKEN_CEILING / 2 } };

    expect(tokenCeilingReached({ steps: [half] })).toBe(false);
    expect(tokenCeilingReached({ steps: [half, half] })).toBe(true);
  });

  it("should treat steps with unreported usage as zero", () => {
    expect(tokenCeilingReached({ steps: [{ usage: {} }] })).toBe(false);
  });
});

describe("token ceiling on a real agent run", () => {
  it("should stop the tool loop after two 30k-token steps instead of running to the step limit", async () => {
    let calls = 0;
    const model = {
      specificationVersion: "v2",
      provider: "mock",
      modelId: "mock",
      supportedUrls: {},
      async doGenerate() {
        calls += 1;

        return {
          content: [
            {
              type: "tool-call",
              toolCallId: `c${calls}`,
              toolName: "ping",
              input: "{}",
            },
          ],
          finishReason: "tool-calls",
          usage: {
            inputTokens: 30_000,
            outputTokens: 100,
            totalTokens: 30_100,
          },
          warnings: [],
        };
      },
      async doStream() {
        throw new Error("stream not used");
      },
    };
    const ping = createTool({
      id: "ping",
      description: "ping",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    });
    const agent = new Agent({
      id: "ceiling-test",
      name: "ceiling-test",
      instructions: "x",
      model,
      tools: { ping },
    } as never);
    const { stopWhen } = buildChatQueueRunOptions({
      fallback: false,
      webTools,
      sink: createChatQueueProposalSink(),
      allowUpdate: true,
    });

    await agent.generate("hi", { stopWhen } as never);

    expect(calls).toBe(2);
  });
});
