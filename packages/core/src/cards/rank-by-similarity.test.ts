import { describe, expect, it } from "vitest";
import { rankBySimilarity } from "./rank-by-similarity.js";

interface TestItem {
  id: string;
  embedding: number[];
}

describe("rankBySimilarity", () => {
  it("ranks items highest-similarity first", () => {
    const query = [1, 0];
    const items: TestItem[] = [
      { id: "far", embedding: [0, 1] },
      { id: "exact", embedding: [1, 0] },
      { id: "mid", embedding: [1, 1] },
    ];

    const ranked = rankBySimilarity(query, items, 3);

    expect(ranked.map((r) => r.id)).toEqual(["exact", "mid", "far"]);
  });

  it("caps results at topK", () => {
    const query = [1, 0];
    const items: TestItem[] = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0.9, 0.1] },
      { id: "c", embedding: [0.5, 0.5] },
    ];

    const ranked = rankBySimilarity(query, items, 2);

    expect(ranked).toHaveLength(2);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns every item when there are fewer than topK", () => {
    const query = [1, 0];
    const items: TestItem[] = [{ id: "only", embedding: [1, 0] }];

    const ranked = rankBySimilarity(query, items, 10);

    expect(ranked).toHaveLength(1);
  });

  it("returns an empty array for empty input", () => {
    const ranked = rankBySimilarity([1, 0], [], 5);

    expect(ranked).toEqual([]);
  });

  it("attaches the real similarity score to each result", () => {
    const query = [1, 0];
    const items: TestItem[] = [{ id: "exact", embedding: [1, 0] }];

    const ranked = rankBySimilarity(query, items, 1);

    expect(ranked[0]!.similarity).toBeCloseTo(1, 5);
  });

  it("keeps every item up to topK when no minimum similarity is given, even a negative one", () => {
    const query = [1, 0];
    const items: TestItem[] = [
      { id: "exact", embedding: [1, 0] },
      { id: "unrelated", embedding: [0, 1] },
      { id: "opposite", embedding: [-1, 0] },
    ];

    const ranked = rankBySimilarity(query, items, 3);

    expect(ranked.map((r) => r.id)).toEqual(["exact", "unrelated", "opposite"]);
  });

  it("drops items below the minimum similarity, even when there are fewer than topK", () => {
    const query = [1, 0];
    const items: TestItem[] = [
      { id: "exact", embedding: [1, 0] },
      { id: "unrelated", embedding: [0, 1] },
    ];

    const ranked = rankBySimilarity(query, items, 10, 0.3);

    expect(ranked.map((r) => r.id)).toEqual(["exact"]);
  });

  it("keeps an item exactly at the minimum similarity boundary", () => {
    const query = [1, 0];
    const items: TestItem[] = [{ id: "boundary", embedding: [1, 0] }];

    const ranked = rankBySimilarity(query, items, 10, 1);

    expect(ranked.map((r) => r.id)).toEqual(["boundary"]);
  });
});
