import { describe, expect, it } from "vitest";
import { deriveModuleFillStates, unfilledModulesInFillOrder } from "./select-unfilled-module";

describe("unfilledModulesInFillOrder", () => {
  it("selects the first empty module in book order as the head of the queue", () => {
    const queue = unfilledModulesInFillOrder([
      { id: "mod_3", order: 3, topicCount: 0 },
      { id: "mod_1", order: 1, topicCount: 2 },
      { id: "mod_2", order: 2, topicCount: 0 },
    ]);

    expect(queue.map((m) => m.id)).toEqual(["mod_2", "mod_3"]);
  });

  it("excludes modules that already have topics", () => {
    const queue = unfilledModulesInFillOrder([
      { id: "mod_1", order: 1, topicCount: 3 },
    ]);

    expect(queue).toEqual([]);
  });

  it("returns an empty queue when every module is filled, signalling the legacy fallback", () => {
    expect(
      unfilledModulesInFillOrder([
        { id: "mod_1", order: 1, topicCount: 3 },
        { id: "mod_2", order: 2, topicCount: 1 },
      ]),
    ).toEqual([]);
  });

  it("returns an empty queue for a course with no modules at all", () => {
    expect(unfilledModulesInFillOrder([])).toEqual([]);
  });
});

describe("deriveModuleFillStates", () => {
  it("counts each module's topics from a flat list of topic moduleIds", () => {
    const states = deriveModuleFillStates(
      [
        { id: "mod_1", order: 1, title: "Chapter 1" },
        { id: "mod_2", order: 2, title: "Chapter 2" },
      ],
      ["mod_1", "mod_1", "mod_1"],
    );

    expect(states).toEqual([
      { id: "mod_1", order: 1, title: "Chapter 1", topicCount: 3 },
      { id: "mod_2", order: 2, title: "Chapter 2", topicCount: 0 },
    ]);
  });

  it("gives every module a zero topicCount when nothing has been generated yet", () => {
    const states = deriveModuleFillStates(
      [{ id: "mod_1", order: 1, title: "Chapter 1" }],
      [],
    );

    expect(states).toEqual([{ id: "mod_1", order: 1, title: "Chapter 1", topicCount: 0 }]);
  });
});
