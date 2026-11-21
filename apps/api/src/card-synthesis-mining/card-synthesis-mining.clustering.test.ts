import { describe, expect, it } from "vitest";
import { clusterBits, cosineSimilarity, type EmbeddedBit } from "./card-synthesis-mining.clustering.js";

function bit(id: string, angleDeg: number): EmbeddedBit {
  const rad = (angleDeg * Math.PI) / 180;

  return { id, embedding: [Math.cos(rad), Math.sin(rad)] };
}

describe("cosineSimilarity", () => {
  it("should treat an all-zero vector as unrelated to everything", () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });
});

describe("clusterBits", () => {
  it("should group cards at or above the 0.60 similarity threshold", () => {
    const result = clusterBits([bit("a", 0), bit("b", 40), bit("c", 80), bit("far", 175)]);

    expect(result.clusters).toEqual([{ bitIds: ["a", "b", "c"], overflowBitIds: [] }]);
    expect(result.unclusteredBitIds).toEqual(["far"]);
  });

  it("should chain cards that are only linked through a neighbour", () => {
    const result = clusterBits([bit("a", 0), bit("b", 50), bit("c", 100)]);

    expect(result.clusters).toHaveLength(1);
  });

  it("should not link cards below the threshold", () => {
    const result = clusterBits([bit("a", 0), bit("b", 60), bit("c", 120)], { threshold: 0.6 });

    expect(result.clusters).toEqual([]);
    expect(result.unclusteredBitIds).toEqual(["a", "b", "c"]);
  });

  it("should leave groups smaller than 3 unclustered", () => {
    const result = clusterBits([bit("a", 0), bit("b", 10), bit("x", 90), bit("y", 100), bit("z", 180)]);

    expect(result.clusters).toEqual([]);
    expect(result.unclusteredBitIds).toEqual(["a", "b", "x", "y", "z"]);
  });

  it("should cap a cluster at 12 cards keeping the closest and reporting the rest as overflow", () => {
    const bits = Array.from({ length: 14 }, (_, i) => bit(`n${i}`, i === 13 ? 55 : i));
    const result = clusterBits(bits);
    const [cluster] = result.clusters;

    expect(result.clusters).toHaveLength(1);
    expect(cluster?.bitIds).toHaveLength(12);
    expect(cluster?.overflowBitIds).toHaveLength(2);
    expect(cluster?.overflowBitIds).not.toContain("n6");
    expect([...(cluster?.bitIds ?? []), ...(cluster?.overflowBitIds ?? [])].sort()).toEqual(
      bits.map((b) => b.id).sort(),
    );
  });

  it("should return the same clusters in the same order for the same input", () => {
    const bits = [bit("a", 0), bit("q", 170), bit("b", 20), bit("r", 175), bit("c", 40), bit("s", 178)];

    expect(clusterBits(bits)).toEqual(clusterBits(bits));
    expect(clusterBits(bits).clusters.map((c) => c.bitIds)).toEqual([["a", "b", "c"], ["q", "r", "s"]]);
  });

  it("should return nothing for an empty batch", () => {
    expect(clusterBits([])).toEqual({ clusters: [], unclusteredBitIds: [] });
  });
});
