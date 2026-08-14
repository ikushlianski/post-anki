import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Gap } from "@post-anki/shared";

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { cardsCompiler: "cardsCompiler" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: vi.fn(),
}));

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: vi.fn(async () => null),
  getCurriculumPromptContext: vi.fn(async () => null),
}));

vi.mock("../gap/gap.repo.js", () => ({
  listGapsForTopic: vi.fn(async () => []),
}));

const cardsRepoState = {
  replaced: [] as { topicId: string; plan: unknown }[],
  statuses: [] as { topicId: string; status: string }[],
};

vi.mock("./cards.repo.js", () => ({
  replaceCardsContent: vi.fn(async (topicId: string, plan: unknown) => {
    cardsRepoState.replaced.push({ topicId, plan });
  }),
  setCardsStatus: vi.fn(async (topicId: string, status: string) => {
    cardsRepoState.statuses.push({ topicId, status });
  }),
}));

import { buildCardsPrompt, compileCards } from "./cards.orchestrator.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import { listGapsForTopic } from "../gap/gap.repo.js";

function gap(label: string): Gap {
  return {
    id: `gap_${label}`,
    topicId: "topic_1",
    label,
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: true,
    concern: null,
    lastEvaluatedAt: null,
    mastery: null,
    triageState: "untriaged",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    untriagedSince: "2020-01-01T00:00:00.000Z",
    autoDeferredAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cardsRepoState.replaced = [];
  cardsRepoState.statuses = [];
});

describe("buildCardsPrompt", () => {
  it("embeds the topic title, summary, and curriculum context", () => {
    const prompt = buildCardsPrompt(
      { title: "CAP theorem", summary: "Tradeoffs in distributed systems" },
      [],
      "Distributed Systems 101 (subject: Backend)",
    );

    expect(prompt).toContain("CAP theorem");
    expect(prompt).toContain("Tradeoffs in distributed systems");
    expect(prompt).toContain("Distributed Systems 101 (subject: Backend)");
  });

  it("lists known gap labels when gaps are recorded", () => {
    const prompt = buildCardsPrompt(
      { title: "CAP theorem", summary: null },
      [gap("Doesn't distinguish CP from AP tradeoffs")],
      undefined,
    );

    expect(prompt).toContain("Doesn't distinguish CP from AP tradeoffs");
  });

  it("degrades cleanly with no summary, no curriculum context, and no gaps", () => {
    const prompt = buildCardsPrompt({ title: "CAP theorem", summary: null }, [], undefined);

    expect(prompt).toContain("CAP theorem");
    expect(prompt).toContain("no gaps recorded yet");
    expect(prompt).not.toContain("Summary:");
    expect(prompt).not.toContain("Curriculum context:");
  });
});

describe("compileCards", () => {
  describe("a topic the agent successfully covers", () => {
    it("persists the generated plan via replaceCardsContent", async () => {
      vi.mocked(getTopicRow).mockResolvedValue({
        title: "CAP theorem",
        summary: "Tradeoffs in distributed systems",
      } as never);
      vi.mocked(listGapsForTopic).mockResolvedValue([]);

      mockAgentGenerate.mockResolvedValue({
        object: {
          cards: [
            {
              concept: "Consistency vs availability",
              variants: [
                { prompt: "Why can't you have both C and A under partition?", answer: "..." },
                { prompt: "What does the CAP theorem force you to give up?", answer: "..." },
                { prompt: "Under a network partition, which guarantee breaks first?", answer: "..." },
              ],
            },
          ],
        },
      });

      await compileCards("topic_1");

      expect(cardsRepoState.replaced).toHaveLength(1);
      expect(cardsRepoState.replaced[0]).toMatchObject({ topicId: "topic_1" });
      expect(cardsRepoState.statuses).toHaveLength(0);
    });
  });

  describe("when the agent returns no structured output", () => {
    it("flips the card set to failed rather than persisting nothing", async () => {
      vi.mocked(getTopicRow).mockResolvedValue({
        title: "CAP theorem",
        summary: null,
      } as never);
      vi.mocked(listGapsForTopic).mockResolvedValue([]);

      mockAgentGenerate.mockResolvedValue({ object: undefined });

      await compileCards("topic_1");

      expect(cardsRepoState.replaced).toHaveLength(0);
      expect(cardsRepoState.statuses).toEqual([{ topicId: "topic_1", status: "failed" }]);
    });
  });

  describe("when the topic doesn't exist", () => {
    it("flips the card set to failed and never calls the agent", async () => {
      vi.mocked(getTopicRow).mockResolvedValue(null);

      await compileCards("topic_missing");

      expect(mockAgentGenerate).not.toHaveBeenCalled();
      expect(cardsRepoState.replaced).toHaveLength(0);
      expect(cardsRepoState.statuses).toEqual([{ topicId: "topic_missing", status: "failed" }]);
    });
  });
});
