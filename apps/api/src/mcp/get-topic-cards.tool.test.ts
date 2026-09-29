import { describe, expect, it, vi } from "vitest";
import type { TopicCardSet } from "@post-anki/shared";

const state = vi.hoisted(() => ({
  cardSet: null as TopicCardSet | null,
}));

vi.mock("../cards/cards.repo.js", () => ({
  getCardsByTopic: vi.fn(async () => state.cardSet),
}));

const { getTopicCards } = await import("./get-topic-cards.tool.js");

function makeCardSet(overrides: Partial<TopicCardSet> = {}): TopicCardSet {
  return {
    id: "cardset_1",
    topicId: "top_1",
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    cards: [
      {
        id: "card_1",
        cardSetId: "cardset_1",
        order: 1,
        concept: "Greetings",
        variants: [{ id: "var_1", cardId: "card_1", order: 1, prompt: "Hello", answer: "Привет" }],
      },
    ],
    ...overrides,
  };
}

describe("getTopicCards", () => {
  it("reshapes a ready set's cards, dropping internal ids like cardSetId/variant id/cardId", async () => {
    state.cardSet = makeCardSet();

    const result = await getTopicCards({ topicId: "top_1" });

    expect(result).toEqual({
      topicId: "top_1",
      status: "ready",
      cards: [
        {
          id: "card_1",
          concept: "Greetings",
          variants: [{ prompt: "Hello", answer: "Привет" }],
        },
      ],
    });
  });

  it("returns every card and every prompt/answer variant, not just the first of each", async () => {
    state.cardSet = makeCardSet({
      cards: [
        {
          id: "card_1",
          cardSetId: "cardset_1",
          order: 1,
          concept: "Greetings",
          variants: [
            { id: "var_1", cardId: "card_1", order: 1, prompt: "Hello", answer: "Привет" },
            { id: "var_2", cardId: "card_1", order: 2, prompt: "Hi", answer: "Здравствуйте" },
          ],
        },
        {
          id: "card_2",
          cardSetId: "cardset_1",
          order: 2,
          concept: "Farewells",
          variants: [{ id: "var_3", cardId: "card_2", order: 1, prompt: "Bye", answer: "Пока" }],
        },
      ],
    });

    const result = await getTopicCards({ topicId: "top_1" });

    expect(result).toEqual({
      topicId: "top_1",
      status: "ready",
      cards: [
        {
          id: "card_1",
          concept: "Greetings",
          variants: [
            { prompt: "Hello", answer: "Привет" },
            { prompt: "Hi", answer: "Здравствуйте" },
          ],
        },
        {
          id: "card_2",
          concept: "Farewells",
          variants: [{ prompt: "Bye", answer: "Пока" }],
        },
      ],
    });
  });

  it("returns the generating status with an empty card list, even when stale cards remain from a prior ready set", async () => {
    state.cardSet = makeCardSet({ status: "generating" });

    const result = await getTopicCards({ topicId: "top_1" });

    expect(result).toEqual({ topicId: "top_1", status: "generating", cards: [] });
  });

  it("returns the failed status with an empty card list, even when stale cards remain", async () => {
    state.cardSet = makeCardSet({ status: "failed" });

    const result = await getTopicCards({ topicId: "top_1" });

    expect(result).toEqual({ topicId: "top_1", status: "failed", cards: [] });
  });

  it("returns null for a topic with no card set at all", async () => {
    state.cardSet = null;

    const result = await getTopicCards({ topicId: "top_missing" });

    expect(result).toBeNull();
  });
});
