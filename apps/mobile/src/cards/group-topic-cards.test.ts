import { describe, expect, it } from "vitest";
import { groupTopicCardRows, type TopicCardJoinRow } from "./group-topic-cards";

function row(overrides: Partial<TopicCardJoinRow> = {}): TopicCardJoinRow {
  return {
    sets: { id: "set_1", topic_id: "topic_1", status: "ready", created_at: "2026-01-01" },
    cards: { id: "card_1", card_set_id: "set_1", order: 1, concept: "Closures" },
    variants: { id: "variant_1", card_id: "card_1", order: 1, prompt: "Q1", answer: "A1" },
    ...overrides,
  };
}

describe("groupTopicCardRows", () => {
  it("groups multiple variant rows under their own card", () => {
    const rows = [
      row({ variants: { id: "v1", card_id: "card_1", order: 1, prompt: "Q1", answer: "A1" } }),
      row({ variants: { id: "v2", card_id: "card_1", order: 2, prompt: "Q2", answer: "A2" } }),
    ];

    const grouped = groupTopicCardRows(rows);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.concept).toBe("Closures");
    expect(grouped[0]!.variants).toEqual([
      { prompt: "Q1", answer: "A1" },
      { prompt: "Q2", answer: "A2" },
    ]);
  });

  it("sorts variants within a card by their own order, not row arrival order", () => {
    const rows = [
      row({ variants: { id: "v2", card_id: "card_1", order: 2, prompt: "Second", answer: "A2" } }),
      row({ variants: { id: "v1", card_id: "card_1", order: 1, prompt: "First", answer: "A1" } }),
    ];

    const grouped = groupTopicCardRows(rows);

    expect(grouped[0]!.variants.map((v) => v.prompt)).toEqual(["First", "Second"]);
  });

  it("sorts cards by their own order, not row arrival order", () => {
    const rows = [
      row({
        cards: { id: "card_2", card_set_id: "set_1", order: 2, concept: "Second concept" },
        variants: { id: "v2", card_id: "card_2", order: 1, prompt: "Q", answer: "A" },
      }),
      row({
        cards: { id: "card_1", card_set_id: "set_1", order: 1, concept: "First concept" },
        variants: { id: "v1", card_id: "card_1", order: 1, prompt: "Q", answer: "A" },
      }),
    ];

    const grouped = groupTopicCardRows(rows);

    expect(grouped.map((c) => c.concept)).toEqual(["First concept", "Second concept"]);
  });

  it("returns an empty array for no rows", () => {
    expect(groupTopicCardRows([])).toEqual([]);
  });
});
