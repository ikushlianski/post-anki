import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({ getAgent: vi.fn().mockReturnValue({ generate: generateMock }) }),
  AGENT_KEYS: { knowledgeBitBusinessCards: "knowledgeBitBusinessCards" },
}));
vi.mock("../shared/env.js", () => ({ loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }) }));
vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _id: unknown, _key: string, fn: () => unknown) => fn()),
}));
vi.mock("../admin-settings/admin-settings.repo.js", () => ({
  getKnowledgeItemModelId: vi.fn().mockResolvedValue("openrouter/google/gemma-4-31b-it"),
}));

import {
  buildBusinessCardsPrompt,
  pickBusinessLessons,
} from "./knowledge-bit-business-cards.agent.js";
import { runKnowledgeBitSourceItems } from "./knowledge-bit-source-items.agent.js";
import { selectNewItems } from "../knowledge-bit/knowledge-bit-source-item-validation.js";
import {
  MULTI_PARAGRAPH_CARDS,
  MULTI_PARAGRAPH_SOURCE,
  NEGOTIATION_CARDS,
  NEGOTIATION_SOURCE,
} from "./knowledge-bit-list-cards.test-mocks.js";

function reply(cards: unknown[]): { text: string } {
  return { text: JSON.stringify({ cards }) };
}

describe("list-aware business card writer", () => {
  it("should tell the writer never to put a whole list on one card's back and to quote a single list item", () => {
    const prompt = buildBusinessCardsPrompt(NEGOTIATION_SOURCE);

    expect(prompt).toContain("NEVER put");
    expect(prompt).toContain("Situation to category");
    expect(prompt).toContain("quote ONE item or sentence, never a span across list numbering");
    expect(prompt).toContain('is never an "ordered_list"');
  });

  it("should tell the writer to give every substantive paragraph its own card", () => {
    const prompt = buildBusinessCardsPrompt(MULTI_PARAGRAPH_SOURCE);

    expect(prompt).toContain("each paragraph, and each standalone fact sentence, as its own source of cards");
    expect(prompt).toContain("skip only filler, greetings or ads");
    expect(prompt).toContain("Write at most 8 cards in total");
  });

  it("should keep every situation card that shares a one-word answer such as a style name", () => {
    const lessons = pickBusinessLessons({ cards: NEGOTIATION_CARDS }, NEGOTIATION_SOURCE);
    const taken = selectNewItems(lessons, new Set(), 8);

    expect(lessons).toHaveLength(6);
    expect(taken).toHaveLength(6);
    expect(taken.filter((lesson) => lesson.cards[0]?.answer === "Уклонение")).toHaveLength(2);
  });

  it("should keep the back as the statement when the answer is longer than a few words", () => {
    const [lesson] = pickBusinessLessons({ cards: [NEGOTIATION_CARDS[5]] }, NEGOTIATION_SOURCE);

    expect(lesson?.statement).toBe("Вы теряете практику и попадаете в порочный круг");
  });

  it("should keep up to eight cards from one list-shaped chunk", () => {
    const cards = [...NEGOTIATION_CARDS, NEGOTIATION_CARDS[0], NEGOTIATION_CARDS[1], NEGOTIATION_CARDS[2]].map((c, i) => ({
      ...c,
      front: `${c?.front} (${i})`,
      back: `${c?.back} ${i}`,
    }));

    expect(pickBusinessLessons({ cards }, NEGOTIATION_SOURCE)).toHaveLength(8);
  });

  it("should write at least one card for each substantive paragraph and skip the ad", async () => {
    generateMock.mockResolvedValueOnce(reply(MULTI_PARAGRAPH_CARDS));

    const drafts = await runKnowledgeBitSourceItems(MULTI_PARAGRAPH_SOURCE, { subjectKind: "business" });
    const questions = drafts.flatMap((lesson) => lesson.cards.map((c) => c.question));

    expect(questions).toHaveLength(3);
    expect(questions.join(" ")).not.toContain("рассылк");
  });
});
