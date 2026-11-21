import { describe, it, expect, vi, beforeEach } from "vitest";

const { recordLlmCallEventMock } = vi.hoisted(() => ({
  recordLlmCallEventMock: vi.fn(),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/spend-guard.js", () => ({
  assertLlmBudgetAvailable: vi.fn(),
  estimateCostUsd: vi.fn(() => 0),
  recordLlmSpend: vi.fn(),
}));

vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: recordLlmCallEventMock,
}));

import {
  generateWithRetry,
  isRateLimitError,
  recordGenerateCall,
} from "./generate-with-retry.js";

describe("generateWithRetry", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("records the full multi-step totalUsage, not just the last step's usage", async () => {
    const result = {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      totalUsage: { inputTokens: 30, outputTokens: 15, totalTokens: 45 },
    };

    await generateWithRetry("op", null, "agent", async () => result);

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 30,
        completionTokens: 15,
        totalTokens: 45,
      }),
    );
  });

  it("falls back to usage when a result carries no totalUsage", async () => {
    const result = {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };

    await generateWithRetry("op", null, "agent", async () => result);

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      }),
    );
  });

  it("falls back to usage field-by-field when totalUsage is missing a field", async () => {
    const result = {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      totalUsage: { inputTokens: 30 },
    };

    await generateWithRetry("op", null, "agent", async () => result);

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: 30,
        completionTokens: 5,
        totalTokens: 15,
      }),
    );
  });
});

describe("recordGenerateCall", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("records the full multi-step totalUsage, not just the last step's usage", async () => {
    const result = {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      totalUsage: { inputTokens: 30, outputTokens: 15, totalTokens: 45 },
    };

    await recordGenerateCall("op", null, "agent", async () => result);

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 30,
        completionTokens: 15,
        totalTokens: 45,
      }),
    );
  });

  it("falls back to usage when a result carries no totalUsage", async () => {
    const result = {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };

    await recordGenerateCall("op", null, "agent", async () => result);

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      }),
    );
  });
});

describe("generateWithRetry model recording", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("should record the pinned model id on a successful call", async () => {
    await generateWithRetry("op", null, "agent", async () => ({ usage: {} }), {
      modelId: "openrouter/openai/gpt-oss-20b",
    });

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, modelId: "openrouter/openai/gpt-oss-20b" }),
    );
  });

  it("should record the pinned model id when every retry fails", async () => {
    await expect(
      generateWithRetry(
        "op",
        null,
        "agent",
        async () => {
          throw new Error("provider down");
        },
        { modelId: "openrouter/mistralai/mistral-nemo" },
      ),
    ).rejects.toThrow("provider down");

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, modelId: "openrouter/mistralai/mistral-nemo" }),
    );
  });

  it("should record a null model id when no model is pinned", async () => {
    await generateWithRetry("op", null, "agent", async () => ({ usage: {} }));

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, modelId: null }),
    );
  });
});

describe("recordGenerateCall model recording", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("should record the pinned model id when the call fails", async () => {
    await expect(
      recordGenerateCall(
        "op",
        null,
        "agent",
        async () => {
          throw new Error("bad output");
        },
        { modelId: "openrouter/inclusionai/ling-3.0-flash-vl" },
      ),
    ).rejects.toThrow("bad output");

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, modelId: "openrouter/inclusionai/ling-3.0-flash-vl" }),
    );
  });

  it("should record a null model id when no model is pinned", async () => {
    await recordGenerateCall("op", null, "agent", async () => ({ usage: {} }));

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, modelId: null }),
    );
  });
});

describe("recordGenerateCall card id", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("should keep the card id on a successful call", async () => {
    await recordGenerateCall("op", null, "agent", async () => ({ usage: {} }), { knowledgeBitId: "kb_1" });

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(expect.objectContaining({ success: true, knowledgeBitId: "kb_1" }));
  });

  it("should keep the card id on a failed call", async () => {
    await expect(
      recordGenerateCall(
        "op",
        null,
        "agent",
        async () => {
          throw new Error("bad output");
        },
        { knowledgeBitId: "kb_1" },
      ),
    ).rejects.toThrow("bad output");

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(expect.objectContaining({ success: false, knowledgeBitId: "kb_1" }));
  });
});

describe("generateWithRetry rate-limit handling", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("should retry a 429 by default so every other caller keeps today's behaviour", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("slow down"), { statusCode: 429 }))
      .mockResolvedValue({});

    await generateWithRetry("op", null, "agent", fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should rethrow a 429 at once when the caller opts out so only the engine waits and retries", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("slow down"), { statusCode: 429 }));

    await expect(
      generateWithRetry("op", null, "agent", fn, { retryRateLimit: false }),
    ).rejects.toThrow("slow down");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should still retry a non-429 failure when the caller opts out of 429 retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream 500"))
      .mockResolvedValue({});

    await generateWithRetry("op", null, "agent", fn, { retryRateLimit: false });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should recognise a 429 buried in the error cause chain", () => {
    expect(isRateLimitError(new Error("x", { cause: { status: 429 } }))).toBe(true);
    expect(isRateLimitError(new Error("x"))).toBe(false);
  });
});

describe("generateWithRetry audit", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("should record price, outcome and source for a call that asks for auditing", async () => {
    const result = { usage: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 } };

    await generateWithRetry("known_cards_judge", null, "knownCardsJudge", async () => result, {
      modelId: "openrouter/deepseek/deepseek-v4-flash",
      audit: { knowledgeSourceId: "src1" },
    });

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "ok", costUsd: 0.3, knowledgeSourceId: "src1" }),
    );
  });

  it("should record a failed outcome with the source when every attempt fails", async () => {
    await expect(
      recordGenerateCall(
        "known_cards_judge",
        null,
        "knownCardsJudge",
        async () => {
          throw new Error("boom");
        },
        { audit: { knowledgeSourceId: "src1" } },
      ),
    ).rejects.toThrow("boom");

    expect(recordLlmCallEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", success: false, knowledgeSourceId: "src1" }),
    );
  });

  it("should leave outcome and cost out for callers that do not ask for auditing", async () => {
    await generateWithRetry("op", null, "agent", async () => ({ usage: { totalTokens: 1 } }));

    const [event] = recordLlmCallEventMock.mock.calls[0]!;

    expect(event).not.toHaveProperty("outcome");
    expect(event).not.toHaveProperty("costUsd");
  });
});

describe("failed call audit", () => {
  beforeEach(() => {
    recordLlmCallEventMock.mockReset();
  });

  it("should log a failed call with model, caller, error class and status but never the provider text", async () => {
    const providerError = Object.assign(new Error("echo of the learner prompt and sk-secret"), {
      name: "APICallError",
      statusCode: 503,
    });

    await expect(
      recordGenerateCall("chat.reply", null, "chatAgent", async () => {
        throw providerError;
      }, { modelId: "openrouter/mistralai/mistral-nemo" }),
    ).rejects.toBe(providerError);

    const event = recordLlmCallEventMock.mock.calls[0]?.[0];

    expect(event).toMatchObject({
      op: "chat.reply",
      agentKey: "chatAgent",
      modelId: "openrouter/mistralai/mistral-nemo",
      success: false,
      errorMessage: "APICallError (503)",
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(event)).not.toContain("sk-secret");
  });

  it("should still throw the original model error when writing the failure log itself fails", async () => {
    recordLlmCallEventMock.mockRejectedValue(new Error("db down"));
    const modelError = new Error("model failed");

    await expect(
      recordGenerateCall("op", null, "agent", async () => {
        throw modelError;
      }),
    ).rejects.toBe(modelError);
  });
});
