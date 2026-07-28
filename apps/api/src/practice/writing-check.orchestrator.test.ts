import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verdict, WritingCheck } from "@post-anki/shared";

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { writingCheck: "writingCheck" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const writingCheckRepoState = {
  inserted: [] as { id: string; subjectId: string; text: string }[],
};

vi.mock("./writing-check.repo.js", () => ({
  insertWritingCheck: vi.fn(
    async (row: {
      id: string;
      subjectId: string;
      text: string;
      score: number;
      verdict: Verdict;
      feedback: string;
      nativeAlternatives: string[];
    }): Promise<WritingCheck> => {
      writingCheckRepoState.inserted.push({ id: row.id, subjectId: row.subjectId, text: row.text });
      return { ...row, createdAt: "2026-07-28T00:00:00.000Z" };
    },
  ),
}));

import { buildWritingCheckPrompt, gradeAndStoreWritingCheck } from "./writing-check.orchestrator.js";

beforeEach(() => {
  vi.clearAllMocks();
  writingCheckRepoState.inserted = [];
});

describe("buildWritingCheckPrompt", () => {
  it("embeds the submitted text verbatim so the mock/agent can content-match it", () => {
    const prompt = buildWritingCheckPrompt("hey can u take a look at this PR when u get a sec");

    expect(prompt).toContain("hey can u take a look at this PR when u get a sec");
  });
});

describe("gradeAndStoreWritingCheck", () => {
  describe("a submission the agent grades as natural", () => {
    it("persists the graded result and returns the full row", async () => {
      mockAgentGenerate.mockResolvedValue({
        object: {
          score: 9,
          verdict: "Ok",
          feedback: "Sounds like a real coworker message.",
          nativeAlternatives: ["Hey, could you take a look at this PR when you get a sec?"],
        },
      });

      const result = await gradeAndStoreWritingCheck(
        "sub_1",
        "hey can u take a look at this PR when u get a sec",
      );

      expect(result).toMatchObject({
        subjectId: "sub_1",
        text: "hey can u take a look at this PR when u get a sec",
        score: 9,
        verdict: "Ok",
      });
      expect(writingCheckRepoState.inserted).toHaveLength(1);
      expect(writingCheckRepoState.inserted[0]).toMatchObject({ subjectId: "sub_1" });
    });
  });

  describe("when the agent returns no structured output", () => {
    it("throws rather than silently persisting an empty grade", async () => {
      mockAgentGenerate.mockResolvedValue({ object: undefined });

      await expect(gradeAndStoreWritingCheck("sub_1", "some text")).rejects.toThrow();
      expect(writingCheckRepoState.inserted).toHaveLength(0);
    });
  });
});
