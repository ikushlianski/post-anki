import { describe, expect, it } from "vitest";
import {
  groupWeights,
  recencyWeight,
  seededUnit,
  selectTiered,
  selectWeighted,
  splitBalance,
  type MixCandidate,
} from "./knowledge-bit-review-queue-parent-mix.js";

const cards = (group: string, count: number): MixCandidate<string>[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${group}-${index}`,
    group,
    item: `${group}-${index}`,
  }));

const equalWeight = () => 1;

describe("parent subject review mix", () => {
  it("should never weight a sub-subject below 1 or above 1.5 so none starves and the favour stays slight", () => {
    const weights = groupWeights([0, 3, 40, 1000]);

    expect(weights.every((weight) => weight >= 1 && weight <= 1.5)).toBe(true);
    expect(weights[3]).toBe(1.5);
  });

  it("should give a sub-subject with no recent reviews exactly the base weight", () => {
    expect(groupWeights([0, 12])[0]).toBe(1);
    expect(groupWeights([0, 0])).toEqual([1, 1]);
  });

  it("should count a review from 14 days ago as half of one made just before the day started", () => {
    expect(recencyWeight(14) / recencyWeight(0)).toBeCloseTo(0.5, 10);
  });

  it("should serve the same cards in the same order for the same seed so a refresh does not reshuffle", () => {
    const candidates = [...cards("a", 15), ...cards("b", 15)];

    expect(selectWeighted(candidates, equalWeight, "day-1", 10)).toEqual(
      selectWeighted(candidates, equalWeight, "day-1", 10),
    );
  });

  it("should reshuffle on a new seed so a new day shows a different mix", () => {
    const candidates = [...cards("a", 15), ...cards("b", 15)];

    expect(selectWeighted(candidates, equalWeight, "day-1", 10)).not.toEqual(
      selectWeighted(candidates, equalWeight, "day-2", 10),
    );
  });

  it("should keep the remaining cards in order when the top card leaves the queue", () => {
    const candidates = [...cards("a", 15), ...cards("b", 15)];
    const before = selectWeighted(candidates, equalWeight, "day-1", 12, () => 15);
    const after = selectWeighted(
      candidates.filter((candidate) => candidate.id !== before[0]),
      equalWeight,
      "day-1",
      11,
      () => 15,
    );

    expect(after).toEqual(before.slice(1));
  });

  it("should not let a sub-subject with 100 cards out-draw one with 5 cards of equal weight", () => {
    const candidates = [...cards("big", 100), ...cards("small", 5)];
    let bigFirst = 0;

    for (let run = 0; run < 500; run++) {
      if (selectWeighted(candidates, equalWeight, `seed-${run}`, 1)[0]!.startsWith("big")) {
        bigFirst++;
      }
    }

    expect(bigFirst / 500).toBeGreaterThan(0.4);
    expect(bigFirst / 500).toBeLessThan(0.6);
  });

  it("should favour the more active sub-subject only slightly at the maximum weight", () => {
    const candidates = [...cards("active", 30), ...cards("quiet", 30)];
    const weightOf = (group: string) => (group === "active" ? 1.5 : 1);
    let activeFirst = 0;

    for (let run = 0; run < 500; run++) {
      if (selectWeighted(candidates, weightOf, `seed-${run}`, 1)[0]!.startsWith("active")) {
        activeFirst++;
      }
    }

    expect(activeFirst / 500).toBeGreaterThan(0.5);
    expect(activeFirst / 500).toBeLessThan(0.7);
  });

  it("should take every card of an earlier tier before any card of a later tier", () => {
    const due = cards("due", 6);
    const waiting = cards("waiting", 30);

    const picked = selectTiered([due, waiting], equalWeight, "day-1", 8);

    expect(picked.slice(0, 6).sort()).toEqual(due.map((candidate) => candidate.item).sort());
    expect(picked.slice(6).every((id) => id.startsWith("waiting"))).toBe(true);
    expect(picked).toHaveLength(8);
  });

  it("should keep seeded values strictly between 0 and 1", () => {
    const values = Array.from({ length: 200 }, (_, index) => seededUnit("seed", `id-${index}`));

    expect(values.every((value) => value > 0 && value < 1)).toBe(true);
  });

  it("should split a page half seen and half new, backfilling from the other pool when one runs short", () => {
    expect(splitBalance(10, 20, 20)).toEqual({ seen: 5, fresh: 5 });
    expect(splitBalance(10, 2, 20)).toEqual({ seen: 2, fresh: 8 });
    expect(splitBalance(10, 20, 3)).toEqual({ seen: 7, fresh: 3 });
    expect(splitBalance(10, 0, 0)).toEqual({ seen: 0, fresh: 0 });
  });
});
