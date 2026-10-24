import { describe, expect, it } from "vitest";
import { closestToCentroid, leaderCluster } from "./subject-suggestion-clustering.js";

const item = (id: string, embedding: number[]) => ({ id, embedding });

describe("leaderCluster", () => {
  it("should group similar bits together and keep unrelated ones apart", () => {
    const clusters = leaderCluster(
      [item("a", [1, 0]), item("b", [0.99, 0.1]), item("c", [0, 1]), item("d", [0.1, 0.99])],
      0.75,
    );

    expect(clusters.map((cluster) => cluster.members.map((m) => m.id))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("should return no clusters for no bits", () => {
    expect(leaderCluster([], 0.75)).toEqual([]);
  });

  it("should not merge bits whose embeddings have a different length", () => {
    expect(leaderCluster([item("a", [1, 0]), item("b", [1, 0, 0])], 0.75)).toHaveLength(2);
  });
});

describe("closestToCentroid", () => {
  it("should pick the bits nearest the cluster centre first", () => {
    const [cluster] = leaderCluster(
      [item("a", [1, 0]), item("b", [0.9, 0.4]), item("c", [0.95, 0.05])],
      0.5,
    );

    expect(closestToCentroid(cluster!, 2).map((m) => m.id)).toEqual(["c", "a"]);
  });
});
