import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../mastra/knowledge-bit-example-generator.agent.js", () => ({
  runKnowledgeBitExampleGenerator: vi.fn(),
}));
vi.mock("./knowledge-bit-example.repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./knowledge-bit-example.repo.js")>()),
  getKnowledgeBitExampleState: vi.fn(),
  writeKnowledgeBitExample: vi.fn(),
}));
vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { runKnowledgeBitExampleGenerator } from "../mastra/knowledge-bit-example-generator.agent.js";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";
import { getKnowledgeBitExampleState, writeKnowledgeBitExample } from "./knowledge-bit-example.repo.js";
import { generateKnowledgeBitExample } from "./knowledge-bit-example.service.js";

const baseState = {
  body: "TCP uses a three-way handshake.",
  background: null,
  approvalState: "pending",
  exampleAiGeneratedAt: null,
  exampleAiCount: 0,
};

const at = new Date("2026-10-28T10:00:00Z");

describe("generateKnowledgeBitExample", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getKnowledgeBitExampleState).mockResolvedValue(baseState);
    vi.mocked(runKnowledgeBitExampleGenerator).mockResolvedValue({ example: "Browser opens a site." });
    vi.mocked(writeKnowledgeBitExample).mockResolvedValue({
      ok: true,
      previousExample: null,
      exampleAiGeneratedAt: at,
      generationsLeft: 4,
    });
  });

  it("should write the first example, report four generations left and no previous text", async () => {
    const result = await generateKnowledgeBitExample("kb_1", false);

    expect(runKnowledgeBitExampleGenerator).toHaveBeenCalledWith("TCP uses a three-way handshake.");
    expect(result).toEqual({
      knowledgeBitId: "kb_1",
      example: "Browser opens a site.",
      exampleAiGeneratedAt: at.toISOString(),
      previousExample: null,
      generationsLeft: 4,
    });
  });

  it("should replace an earlier AI example without overwrite and return the old text", async () => {
    vi.mocked(getKnowledgeBitExampleState).mockResolvedValue({
      ...baseState,
      background: "Old AI text",
      exampleAiGeneratedAt: at,
      exampleAiCount: 1,
    });
    vi.mocked(writeKnowledgeBitExample).mockResolvedValue({
      ok: true,
      previousExample: "Old AI text",
      exampleAiGeneratedAt: at,
      generationsLeft: 3,
    });

    expect(await generateKnowledgeBitExample("kb_1", false)).toMatchObject({
      previousExample: "Old AI text",
      generationsLeft: 3,
    });
  });

  it("should refuse human-written text without overwrite and spend no model call", async () => {
    vi.mocked(getKnowledgeBitExampleState).mockResolvedValue({ ...baseState, background: "Mine" });

    expect(await generateKnowledgeBitExample("kb_1", false)).toEqual({ error: "example_exists" });
    expect(runKnowledgeBitExampleGenerator).not.toHaveBeenCalled();
  });

  it("should replace human-written text when overwrite is true", async () => {
    vi.mocked(getKnowledgeBitExampleState).mockResolvedValue({ ...baseState, background: "Mine" });
    vi.mocked(writeKnowledgeBitExample).mockResolvedValue({
      ok: true,
      previousExample: "Mine",
      exampleAiGeneratedAt: at,
      generationsLeft: 4,
    });

    expect(await generateKnowledgeBitExample("kb_1", true)).toMatchObject({ previousExample: "Mine" });
  });

  it("should stop at the sixth generation with no model call", async () => {
    vi.mocked(getKnowledgeBitExampleState).mockResolvedValue({ ...baseState, exampleAiCount: 5 });

    expect(await generateKnowledgeBitExample("kb_1", false)).toEqual({ error: "limit_reached" });
    expect(runKnowledgeBitExampleGenerator).not.toHaveBeenCalled();
  });

  it("should report not_found and blocked without a model call", async () => {
    vi.mocked(getKnowledgeBitExampleState).mockResolvedValueOnce(null);

    expect(await generateKnowledgeBitExample("kb_x", false)).toEqual({ error: "not_found" });

    vi.mocked(getKnowledgeBitExampleState).mockResolvedValueOnce({ ...baseState, approvalState: "rejected" });

    expect(await generateKnowledgeBitExample("kb_1", false)).toEqual({ error: "blocked" });
    expect(runKnowledgeBitExampleGenerator).not.toHaveBeenCalled();
  });

  it("should report generation_failed and write nothing when the agent fails", async () => {
    vi.mocked(runKnowledgeBitExampleGenerator).mockRejectedValue(new Error("invalid output"));

    expect(await generateKnowledgeBitExample("kb_1", false)).toEqual({ error: "generation_failed" });
    expect(writeKnowledgeBitExample).not.toHaveBeenCalled();
  });

  it("should report budget_exceeded and write nothing when the daily spend guard is exhausted", async () => {
    vi.mocked(runKnowledgeBitExampleGenerator).mockRejectedValue(new LlmBudgetExceededError(5, 5));

    expect(await generateKnowledgeBitExample("kb_1", false)).toEqual({ error: "budget_exceeded" });
    expect(writeKnowledgeBitExample).not.toHaveBeenCalled();
  });

  it("should work for any card shape because only the item body is sent", async () => {
    await generateKnowledgeBitExample("kb_1", false);

    expect(vi.mocked(runKnowledgeBitExampleGenerator).mock.calls[0]).toEqual([baseState.body]);
  });

  it("should surface a write-time refusal such as a concurrent cap hit", async () => {
    vi.mocked(writeKnowledgeBitExample).mockResolvedValue({ ok: false, reason: "limit_reached" });

    expect(await generateKnowledgeBitExample("kb_1", false)).toEqual({ error: "limit_reached" });
  });
});
