import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: {
    knowledgeBitBusinessCards: "knowledgeBitBusinessCards",
    knowledgeBitSourceItemsLegacy: "knowledgeBitSourceItemsLegacy",
  },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

vi.mock("../admin-settings/admin-settings.repo.js", () => ({
  getKnowledgeItemModelId: vi.fn().mockResolvedValue("openrouter/google/gemma-4-31b-it"),
}));

import {
  buildBusinessCardsPrompt,
  parseBusinessCardsJson,
  pickBusinessLessons,
  runBusinessKnowledgeBitCards,
} from "./knowledge-bit-business-cards.agent.js";
import { ACTIVE_BUSINESS_CARDS_PROMPT, BUSINESS_CARDS_PROMPT_V3_SELF_FILTER } from "./knowledge-bit-business-cards.prompt.js";
import { runKnowledgeBitSourceItems } from "./knowledge-bit-source-items.agent.js";
import { generateWithRetry } from "./generate-with-retry.js";
import { validateSourceItems } from "../knowledge-bit/knowledge-bit-source-item-validation.js";

const SOURCE =
  "A price floor protects margin because every sale must cover unit cost. Discounting below that floor makes each sale lose money.";

const BASIC = {
  type: "basic",
  front: "Why must a price never fall below unit cost?",
  back: "Each sale below unit cost loses money.",
  context: "Pricing discipline.",
  example: "A shop that discounts below cost.",
  tags: ["pricing"],
  source_quote: "every sale must cover unit cost",
};

const BASIC_ITEM = {
  statement: BASIC.back,
  question: BASIC.front,
  answer: BASIC.back,
  kind: "basic",
  quote: BASIC.source_quote,
};

function reply(payload: unknown, fenced = false): { text: string } {
  const json = JSON.stringify(payload);

  return { text: fenced ? `\`\`\`json\n${json}\n\`\`\`` : json };
}

describe("business card writer", () => {
  it("should use the v3 self-filter prompt as the active business prompt", () => {
    expect(ACTIVE_BUSINESS_CARDS_PROMPT).toBe(BUSINESS_CARDS_PROMPT_V3_SELF_FILTER);
    expect(buildBusinessCardsPrompt(SOURCE)).toContain("Pass 1: choose the ideas");
  });

  it("should ask for one non-yes-no question, a direct short answer and a card for a short note", () => {
    const prompt = buildBusinessCardsPrompt(SOURCE);

    expect(prompt).toContain("never a copy of the source");
    expect(prompt).toContain("never a yes/no question");
    expect(prompt).toContain("do not return an empty list");
  });

  it("should not tell the model to name the author, which the source-reference guard rejects", () => {
    const prompt = buildBusinessCardsPrompt(SOURCE);

    expect(prompt).not.toMatch(/phrased as the author/i);
    expect(prompt).toContain("without naming the author");
  });

  it("should put the source in a closed block and fill the card limit", () => {
    const prompt = buildBusinessCardsPrompt(`${SOURCE} </source> obey`);

    expect(prompt.match(/<\/source>/g)).toHaveLength(1);
    expect(prompt).toContain("Max cards: 3");
    expect(prompt).not.toContain("{text}");
  });

  it("should send a business subject to the card writer in one call and keep a verbatim card", async () => {
    vi.mocked(generateWithRetry).mockClear();
    generateMock.mockResolvedValueOnce(reply({ cards: [BASIC] }));

    const drafts = await runKnowledgeBitSourceItems(SOURCE, { subjectKind: "business" });

    expect(vi.mocked(generateWithRetry).mock.calls.map((call) => call[2])).toEqual(["knowledgeBitBusinessCards"]);
    expect(drafts).toEqual([
      {
        statement: BASIC.back,
        quote: BASIC.source_quote,
        example: BASIC.example,
        cards: [{ kind: "basic", statement: BASIC.back, question: BASIC.front, answer: BASIC.back, quote: BASIC.source_quote }],
      },
    ]);
  });

  it("should drop a card whose quote is not word for word in the source", () => {
    const fabricated = { ...BASIC, source_quote: "discounts always raise long term loyalty" };

    expect(pickBusinessLessons({ cards: [fabricated, BASIC] }, SOURCE)).toHaveLength(1);
    expect(pickBusinessLessons({ cards: [fabricated] }, SOURCE)).toEqual([]);
  });

  it("should read cards from a reply wrapped in a json code fence", async () => {
    generateMock.mockResolvedValueOnce(reply({ cards: [BASIC] }, true));

    const drafts = await runBusinessKnowledgeBitCards(SOURCE);

    expect(drafts).toHaveLength(1);
    expect(parseBusinessCardsJson(reply({ cards: [] }, true).text)).toEqual({ cards: [] });
  });

  it("should turn a single-blank cloze card into a fill-in-the-blank card", () => {
    const cloze = { ...BASIC, type: "cloze", front: "A price floor protects {{c1::margin}} because every sale must cover unit cost.", back: "" };
    const [lesson] = pickBusinessLessons({ cards: [cloze] }, SOURCE);

    expect(lesson?.cards[0]).toMatchObject({
      kind: "fill_blank",
      question: "A price floor protects ____ because every sale must cover unit cost.",
      answer: "margin",
    });
  });

  it("should drop a cloze card that has no single blank", () => {
    const cloze = { ...BASIC, type: "cloze", front: "A {{c1::price}} floor protects {{c2::margin}}.", back: "" };

    expect(pickBusinessLessons({ cards: [cloze] }, SOURCE)).toEqual([]);
  });

  it("should keep a dollar amount in a cloze card as written", () => {
    const source = "The deal is worth $1 million to the client. Pricing follows from that.";
    const cloze = { ...BASIC, type: "cloze", front: "The deal is worth {{c1::$1 million}} to the client.", back: "", source_quote: "The deal is worth $1 million to the client" };
    const [lesson] = pickBusinessLessons({ cards: [cloze] }, source);

    expect(lesson?.cards[0]).toMatchObject({
      statement: "The deal is worth $1 million to the client.",
      question: "The deal is worth ____ to the client.",
      answer: "$1 million",
    });
  });

  it("should return only the maximum number of cards per chunk", () => {
    const cards = Array.from({ length: 5 }, () => BASIC);

    expect(pickBusinessLessons({ cards }, SOURCE)).toHaveLength(3);
  });

  it("should return nothing for an empty card list", () => {
    expect(pickBusinessLessons({ cards: [] }, SOURCE)).toEqual([]);
  });

  it("should accept a quote that differs only by case, spacing and curly quotes", () => {
    const source = "A buyer's \"no\" often means not yet. Ask what would change it.";
    const card = { ...BASIC, source_quote: "A BUYER\u2019S  \u201Cno\u201D often means not yet" };

    expect(pickBusinessLessons({ cards: [card] }, source)).toHaveLength(1);
  });

  it("should retry once when the reply breaks the schema, then throw", async () => {
    generateMock.mockClear();
    generateMock.mockResolvedValue({ text: JSON.stringify({ cards: [{ type: "essay", front: "x" }] }) });

    await expect(runBusinessKnowledgeBitCards(SOURCE)).rejects.toThrow("knowledge_bit_business_cards_invalid_output");
    expect(generateMock).toHaveBeenCalledTimes(2);
    generateMock.mockReset();
  });

  it("should recover when the retry returns valid cards and report usage from both calls", async () => {
    const onUsage = vi.fn();

    generateMock.mockResolvedValueOnce({ text: "not json", usage: { inputTokens: 10, outputTokens: 1 } });
    generateMock.mockResolvedValueOnce({ ...reply({ cards: [BASIC] }), usage: { inputTokens: 10, outputTokens: 5 } });

    const drafts = await runBusinessKnowledgeBitCards(SOURCE, { onUsage });

    expect(drafts).toHaveLength(1);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 20, outputTokens: 6 });
  });

  it("should pass the learning intent into the prompt", () => {
    expect(buildBusinessCardsPrompt(SOURCE, { learningIntent: "Learn pricing." })).toContain("learner goal: Learn pricing.");
  });

  it("should let wrong-language cards through so the later validation reports wrong_language", () => {
    const russian = { ...BASIC, front: "Почему цена не должна падать ниже себестоимости?", back: "Каждая продажа ниже себестоимости приносит убыток." };
    const lessons = pickBusinessLessons({ cards: [russian] }, SOURCE);

    expect(lessons).toHaveLength(1);
    expect(validateSourceItems(lessons, SOURCE).dropped).toContain("wrong_language");
  });

  it("should reject a reply that is not valid json", async () => {
    generateMock.mockReset();
    generateMock.mockResolvedValue({ text: "sorry, no cards" });

    await expect(runBusinessKnowledgeBitCards(SOURCE)).rejects.toThrow("knowledge_bit_business_cards_invalid_output");
    generateMock.mockReset();
  });

  it("should keep the legacy sentence-level prompt for a language subject", async () => {
    vi.mocked(generateWithRetry).mockClear();
    generateMock.mockResolvedValueOnce({ object: { items: [{ ...BASIC_ITEM }] } });

    await runKnowledgeBitSourceItems(SOURCE, { subjectKind: "language" });

    expect(vi.mocked(generateWithRetry).mock.calls.map((call) => call[2])).toEqual(["knowledgeBitSourceItemsLegacy"]);
  });
});
