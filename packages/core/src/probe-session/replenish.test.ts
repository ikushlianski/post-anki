import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import { rankGapsForReplenish, shouldReplenish } from "./replenish";

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "top-1",
    label: "some sub-skill",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    ...overrides,
  };
}

describe("shouldReplenish", () => {
  it("says no more generation is needed while comfortably above the floor", () => {
    expect(shouldReplenish(20, 5, 10)).toBe(false);
  });

  it("triggers the instant remaining unanswered questions hits the floor", () => {
    expect(shouldReplenish(20, 10, 10)).toBe(true);
  });

  it("stays triggered for every answer after crossing the floor, not just the first", () => {
    expect(shouldReplenish(20, 15, 10)).toBe(true);
  });

  it("still triggers once the session is fully answered, so a session with open gaps can keep growing", () => {
    expect(shouldReplenish(10, 10, 10)).toBe(true);
  });
});

describe("rankGapsForReplenish", () => {
  it("puts a wanted gap ahead of an unwanted one regardless of input order", () => {
    const unwanted = gap({ id: "g-unwanted", wanted: false });
    const wanted = gap({ id: "g-wanted", wanted: true });

    const ranked = rankGapsForReplenish([unwanted, wanted]);

    expect(ranked.map((g) => g.id)).toEqual(["g-wanted", "g-unwanted"]);
  });

  it("orders equally-wanted gaps by shallower depth first", () => {
    const deep = gap({ id: "g-deep", wanted: true, depth: "deep" });
    const shallow = gap({ id: "g-shallow", wanted: true, depth: "awareness" });
    const mid = gap({ id: "g-mid", wanted: true, depth: "working" });

    const ranked = rankGapsForReplenish([deep, mid, shallow]);

    expect(ranked.map((g) => g.id)).toEqual(["g-shallow", "g-mid", "g-deep"]);
  });

  it("prioritizes wanted-but-deep over unwanted-but-shallow, matching nextGapToProbe's own ordering", () => {
    const unwantedShallow = gap({ id: "g-unwanted-shallow", wanted: false, depth: "awareness" });
    const wantedDeep = gap({ id: "g-wanted-deep", wanted: true, depth: "deep" });

    const ranked = rankGapsForReplenish([unwantedShallow, wantedDeep]);

    expect(ranked.map((g) => g.id)).toEqual(["g-wanted-deep", "g-unwanted-shallow"]);
  });

  it("does not mutate the input array", () => {
    const gaps = [gap({ id: "g1", wanted: false }), gap({ id: "g2", wanted: true })];
    const original = [...gaps];

    rankGapsForReplenish(gaps);

    expect(gaps).toEqual(original);
  });
});
