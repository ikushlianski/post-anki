import { beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("@mastra/core/agent", () => ({ Agent: class {} }));
vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({ getAgent: vi.fn().mockReturnValue({ generate: generateMock }) }),
  AGENT_KEYS: {
    knowledgeBitLessons: "knowledgeBitLessons",
    knowledgeBitSourceItems: "knowledgeBitSourceItems",
    knowledgeBitSourceItemsLegacy: "knowledgeBitSourceItemsLegacy",
    knowledgeBitBusinessCards: "knowledgeBitBusinessCards",
    knowledgeBitMeetingPhrase: "knowledgeBitMeetingPhrase",
  },
}));
vi.mock("../shared/env.js", () => ({ loadEnv: vi.fn().mockReturnValue({}) }));
vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _id: unknown, _key: string, fn: () => unknown) => fn()),
}));
vi.mock("../admin-settings/admin-settings.repo.js", () => ({
  getKnowledgeItemModelId: vi.fn().mockResolvedValue("openrouter/test-model"),
}));

import { buildBusinessCardsPrompt, runBusinessKnowledgeBitCards } from "./knowledge-bit-business-cards.agent.js";
import { buildKnowledgeBitLessonsPrompt } from "./knowledge-bit-lessons.agent.js";
import { buildMeetingPhrasePrompt, MEETING_PHRASE_INSTRUCTIONS } from "./knowledge-bit-meeting-phrase.prompt.js";
import { runMeetingPhraseCard } from "./knowledge-bit-meeting-phrase.agent.js";
import { buildKnowledgeBitSourceItemsPrompt } from "./knowledge-bit-source-items.legacy.agent.js";
import { buildKnowledgeBitCardsPrompt, runKnowledgeBitSourceItems } from "./knowledge-bit-source-items.agent.js";
import { formatPhraseSourceText } from "../knowledge-source/phrase-source-text.js";

const BLOCK = "<known_cards>\nDo not restate them.\n- [near] Q: What is a heads-up? A: An early warning.\n</known_cards>";
const CHUNK = "A heads-up is an early warning given before a change lands.";
const LESSON = { statement: "A heads-up is an early warning.", example: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("known cards in generation prompts", () => {
  it("should add the already-known block to the phrase prompt only when it is not empty", () => {
    expect(buildMeetingPhrasePrompt("heads-up", null, false, BLOCK)).toContain(BLOCK);
    expect(buildMeetingPhrasePrompt("heads-up", null, false, "")).not.toContain("known_cards");
    expect(buildMeetingPhrasePrompt("heads-up", null, false)).toBe("<phrase>\nheads-up\n</phrase>");
  });

  it("should tell the phrase writer to keep the phrase word for word and vary only the situation when known cards are present", () => {
    const prompt = buildMeetingPhrasePrompt("heads-up", null, false, BLOCK);

    expect(prompt).toContain("must still contain the phrase word for word");
    expect(prompt).toContain("never swap the phrase");
    expect(buildMeetingPhrasePrompt("heads-up", null, false, "")).not.toContain("word for word");
  });

  it("should keep the word-for-word and North American IT meeting rules in the phrase instructions", () => {
    expect(MEETING_PHRASE_INSTRUCTIONS).toContain("word for word");
    expect(MEETING_PHRASE_INSTRUCTIONS).toContain("North American (US or Canadian) IT-industry native speaker");
    expect(MEETING_PHRASE_INSTRUCTIONS).toContain("TYPICAL SITUATIONS");
  });

  it("should add the already-known block to the lessons prompt only when it is not empty", () => {
    const withBlock = buildKnowledgeBitLessonsPrompt(CHUNK, "", false, "", undefined, [], BLOCK);

    expect(withBlock).toContain(BLOCK);
    expect(buildKnowledgeBitLessonsPrompt(CHUNK, "", false, "", undefined, [], "")).not.toContain("known_cards");
    expect(buildKnowledgeBitLessonsPrompt(CHUNK, "")).not.toContain("known_cards");
  });

  it("should add the already-known block to the cards prompt only when it is not empty", () => {
    expect(buildKnowledgeBitCardsPrompt([LESSON], CHUNK, false, "", "", BLOCK)).toContain(BLOCK);
    expect(buildKnowledgeBitCardsPrompt([LESSON], CHUNK, false, "", "", "")).not.toContain("known_cards");
    expect(buildKnowledgeBitCardsPrompt([LESSON], CHUNK)).not.toContain("known_cards");
  });

  it("should add the already-known block to the legacy prompt only when it is not empty", () => {
    expect(buildKnowledgeBitSourceItemsPrompt(CHUNK, false, "", "", [], BLOCK)).toContain(BLOCK);
    expect(buildKnowledgeBitSourceItemsPrompt(CHUNK, false, "", "", [], "")).not.toContain("known_cards");
    expect(buildKnowledgeBitSourceItemsPrompt(CHUNK)).not.toContain("known_cards");
  });

  it("should add the already-known block to the business prompt only when it is not empty", () => {
    expect(buildBusinessCardsPrompt(CHUNK, { knownCardsBlock: BLOCK })).toContain(BLOCK);
    expect(buildBusinessCardsPrompt(CHUNK, { knownCardsBlock: "" })).toBe(buildBusinessCardsPrompt(CHUNK));
    expect(buildBusinessCardsPrompt(CHUNK)).not.toContain("known_cards");
  });
});

describe("known cards reuse across retries", () => {
  it("should send the same block on both phrase attempts", async () => {
    generateMock.mockResolvedValue({ object: {} });

    await expect(
      runMeetingPhraseCard(formatPhraseSourceText("heads-up", null), { knownCardsBlock: BLOCK }),
    ).rejects.toThrow();

    const prompts = generateMock.mock.calls.map((call) => call[0] as string);

    expect(prompts).toHaveLength(2);
    expect(prompts.every((prompt) => prompt.includes(BLOCK))).toBe(true);
    expect(prompts[0]).toBe(prompts[1]);
  });

  it("should send the same block on both business attempts", async () => {
    generateMock.mockResolvedValue({ text: "not json" });

    await expect(runBusinessKnowledgeBitCards(CHUNK, { knownCardsBlock: BLOCK })).rejects.toThrow();

    const prompts = generateMock.mock.calls.map((call) => call[0] as string);

    expect(prompts).toHaveLength(2);
    expect(prompts.every((prompt) => prompt.includes(BLOCK))).toBe(true);
    expect(prompts[0]).toBe(prompts[1]);
  });

  it("should send the same block when lessons are regenerated after none validated", async () => {
    generateMock.mockResolvedValue({
      object: { lessons: [{ lesson: "A heads-up is an early warning.", quote: "text that is not in the source" }] },
    });

    await runKnowledgeBitSourceItems(CHUNK, { knownCardsBlock: BLOCK });

    const prompts = generateMock.mock.calls.map((call) => call[0] as string);

    expect(prompts).toHaveLength(2);
    expect(prompts.every((prompt) => prompt.includes(BLOCK))).toBe(true);
    expect(prompts[0]).toBe(prompts[1]);
  });
});
