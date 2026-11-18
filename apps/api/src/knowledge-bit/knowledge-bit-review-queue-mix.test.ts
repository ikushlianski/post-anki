import { describe, expect, it } from "vitest";

import { interleaveNewWithSeen, weightedShuffle } from "./knowledge-bit-review-queue-mix.js";

describe("interleaveNewWithSeen", () => {
  it("should alternate a seen card and a new card while both kinds remain", () => {
    expect(interleaveNewWithSeen(["s1", "s2", "s3"], ["n1", "n2", "n3"], 10)).toEqual([
      "s1",
      "n1",
      "s2",
      "n2",
      "s3",
      "n3",
    ]);
  });

  it("should keep showing the remaining kind once the other runs out", () => {
    expect(interleaveNewWithSeen(["s1"], ["n1", "n2", "n3"], 10)).toEqual(["s1", "n1", "n2", "n3"]);
    expect(interleaveNewWithSeen(["s1", "s2", "s3"], ["n1"], 10)).toEqual(["s1", "n1", "s2", "s3"]);
  });

  it("should never return more cards than the batch limit", () => {
    expect(interleaveNewWithSeen(["s1", "s2"], ["n1", "n2"], 3)).toEqual(["s1", "n1", "s2"]);
  });

  it("should return nothing when there are no cards", () => {
    expect(interleaveNewWithSeen([], [], 5)).toEqual([]);
  });
});

const DAY = 86_400_000;
const reference = new Date(Date.UTC(2026, 3, 1, 15));
const cards = Array.from({ length: 40 }, (_, i) => ({
  variantId: `v${String(i).padStart(2, "0")}`,
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * 2 * DAY),
}));
const ids = (list: { variantId: string }[]) => list.map((card) => card.variantId);

describe("weightedShuffle", () => {
  it("should give the same order every time for the same seed", () => {
    expect(weightedShuffle(cards, "abc", reference)).toEqual(weightedShuffle(cards, "abc", reference));
  });

  it("should give a different order for a different seed", () => {
    expect(ids(weightedShuffle(cards, "abc", reference))).not.toEqual(ids(weightedShuffle(cards, "xyz", reference)));
  });

  it("should return the same cards without dropping or repeating any", () => {
    expect(ids(weightedShuffle(cards, "abc", reference)).sort()).toEqual(ids(cards));
  });

  it("should not change the cards passed in", () => {
    const copy = [...cards];

    weightedShuffle(cards, "abc", reference);

    expect(cards).toEqual(copy);
  });

  it("should keep the relative order of the remaining cards when others leave and a new one arrives", () => {
    const full = ids(weightedShuffle(cards, "abc", reference));
    const survivors = cards.filter((card) => !full.slice(0, 7).includes(card.variantId));
    const arrival = { variantId: "v-new", createdAt: new Date(reference.getTime() - DAY) };
    const again = ids(weightedShuffle([...survivors, arrival], "abc", reference)).filter((id) => id !== "v-new");

    expect(again).toEqual(full.slice(7));
  });

  it("should not move cards when the reference time changes within the same UTC day", () => {
    const later = new Date(reference.getTime() + 3 * 3_600_000);

    expect(weightedShuffle(cards, "abc", later)).toEqual(weightedShuffle(cards, "abc", reference));
  });

  it("should put recent cards earlier on average across many seeds", () => {
    const positions = new Map<string, number>();

    for (let s = 0; s < 300; s++) {
      weightedShuffle(cards, `seed-${s}`, reference).forEach((card, index) => {
        positions.set(card.variantId, (positions.get(card.variantId) ?? 0) + index);
      });
    }

    const average = (list: { variantId: string }[]) =>
      list.reduce((sum, card) => sum + positions.get(card.variantId)!, 0) / list.length / 300;

    expect(average(cards.slice(-10))).toBeLessThan(average(cards.slice(0, 10)));
  });

  it("should still let the oldest cards show up in the first positions for some seeds", () => {
    let seen = 0;

    for (let s = 0; s < 300; s++) {
      if (ids(weightedShuffle(cards, `seed-${s}`, reference).slice(0, 10)).includes(cards[0]!.variantId)) {
        seen++;
      }
    }

    expect(seen).toBeGreaterThan(0);
  });

  it("should return an empty list for no cards", () => {
    expect(weightedShuffle([], "abc", reference)).toEqual([]);
  });
});
