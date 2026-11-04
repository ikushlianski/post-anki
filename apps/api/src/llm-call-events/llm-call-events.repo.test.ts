import { beforeEach, describe, expect, it, vi } from "vitest";

const { values } = vi.hoisted(() => ({ values: vi.fn() }));

vi.mock("../db/client.js", () => ({
  getDb: () => ({ insert: () => ({ values }) }),
}));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { LLM_ERROR_MESSAGE_MAX_CHARS, capErrorMessage, recordLlmCallEvent } = await import("./llm-call-events.repo.js");

const base = {
  curriculumId: null,
  op: "op",
  agentKey: "agent",
  durationMs: 1,
  success: false,
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
};

describe("capErrorMessage", () => {
  it("should keep a short message and null as they are", () => {
    expect(capErrorMessage("boom")).toBe("boom");
    expect(capErrorMessage(null)).toBeNull();
  });

  it("should cut a long provider message to the limit", () => {
    expect(capErrorMessage("x".repeat(5000))).toHaveLength(LLM_ERROR_MESSAGE_MAX_CHARS);
  });
});

describe("recordLlmCallEvent", () => {
  beforeEach(() => {
    values.mockReset();
    values.mockResolvedValue(undefined);
  });

  it("should store at most the capped error text so note fragments echoed by a provider stay short", async () => {
    await recordLlmCallEvent({ ...base, errorMessage: "y".repeat(3000) });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ errorMessage: "y".repeat(LLM_ERROR_MESSAGE_MAX_CHARS) }));
  });
});
