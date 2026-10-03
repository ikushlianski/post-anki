import { describe, it, expect, vi, beforeEach } from "vitest";

const { recordLlmCallEventMock } = vi.hoisted(() => ({
  recordLlmCallEventMock: vi.fn(),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: recordLlmCallEventMock,
}));

import {
  generateWithRetry,
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
