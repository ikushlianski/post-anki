import { describe, expect, it } from "vitest";
import {
  buildChatQueueTraceMetadata,
  buildChatQueueTracingOptions,
  chatQueueOutcomeFor,
} from "./knowledge-bit-chat-queue.trace.js";

describe("chat queue trace metadata", () => {
  it("should number the turn being sent, starting at 1 for an empty thread", () => {
    expect(buildChatQueueTraceMetadata("bit-1", 0)).toEqual({ feature: "chat-queue", knowledgeBitId: "bit-1", turn: 1 });
    expect(buildChatQueueTraceMetadata("bit-1", 7).turn).toBe(8);
  });

  it("should tag the trace with the feature and carry only ids and the turn number", () => {
    const options = buildChatQueueTracingOptions(buildChatQueueTraceMetadata("bit-1", 2));

    expect(options.tags).toEqual(["chat-queue"]);
    expect(Object.keys(options.metadata).sort()).toEqual(["feature", "knowledgeBitId", "turn"]);
  });

  it("should map each failure the learner can hit to a distinct outcome", () => {
    expect(chatQueueOutcomeFor(null)).toBe("ok");
    expect(chatQueueOutcomeFor("in_flight")).toBe("in_flight");
    expect(chatQueueOutcomeFor("budget_paused")).toBe("spend_guard");
    expect(chatQueueOutcomeFor("model_failed", true)).toBe("rate_limited");
    expect(chatQueueOutcomeFor("model_failed")).toBe("error");
    expect(chatQueueOutcomeFor("not_in_chat")).toBe("error");
  });
});
