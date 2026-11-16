import { describe, expect, it } from "vitest";
import {
  buildPairsAmong,
  cosineSimilarity,
  formatNearDuplicateReport,
  mergePairs,
  truncateText,
  type EmbeddedCard,
  type NearDuplicateCard,
} from "./card-dedup-near-duplicate-report.js";

function card(variantId: string, bitId: string, prompt = "front", answer = "back"): NearDuplicateCard {
  return { variantId, bitId, prompt, answer };
}

function embedded(variantId: string, bitId: string, embedding: number[]): EmbeddedCard {
  return { card: card(variantId, bitId), embedding };
}

describe("cosineSimilarity", () => {
  it("should treat cards pointing the same way as identical", () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
  });

  it("should never report a zero vector as similar", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("buildPairsAmong", () => {
  it("should pair only cards at or above the threshold", () => {
    const pairs = buildPairsAmong(
      [embedded("v1", "b1", [1, 0]), embedded("v2", "b2", [1, 0.01]), embedded("v3", "b3", [0, 1])],
      0.85,
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.a.variantId).toBe("v1");
    expect(pairs[0]!.b.variantId).toBe("v2");
  });

  it("should not flag two cards of the same knowledge bit against each other", () => {
    expect(buildPairsAmong([embedded("v1", "b1", [1, 0]), embedded("v2", "b1", [1, 0])], 0.85)).toEqual([]);
  });
});

describe("mergePairs", () => {
  it("should list a pair once even when both lookups found it, in either order", () => {
    const merged = mergePairs(
      [{ similarity: 0.9, a: card("v1", "b1"), b: card("v2", "b2") }],
      [{ similarity: 0.9, a: card("v2", "b2"), b: card("v1", "b1") }],
    );

    expect(merged).toHaveLength(1);
  });

  it("should put the most similar pairs first so the user reviews the clearest duplicates first", () => {
    const merged = mergePairs([
      { similarity: 0.87, a: card("v1", "b1"), b: card("v2", "b2") },
      { similarity: 0.98, a: card("v3", "b3"), b: card("v4", "b4") },
    ]);

    expect(merged.map((pair) => pair.similarity)).toEqual([0.98, 0.87]);
  });
});

describe("truncateText", () => {
  it("should shorten long card text and collapse line breaks", () => {
    expect(truncateText("a\n\nb", 10)).toBe("a b");
    expect(truncateText("x".repeat(50), 10)).toHaveLength(10);
  });
});

describe("formatNearDuplicateReport", () => {
  it("should show similarity, both fronts and backs and both bit ids for each pair", () => {
    const report = formatNearDuplicateReport({
      subject: "Business",
      threshold: 0.85,
      scannedCards: 4,
      embeddedInMemory: 1,
      pairs: [
        {
          similarity: 0.912,
          a: card("v1", "bit_a", "What is churn?", "Customers leaving"),
          b: card("v2", "bit_b", "Define churn", "Lost customers"),
        },
      ],
    });

    expect(report).toContain("Similarity 0.912");
    expect(report).toContain("bit_a");
    expect(report).toContain("bit_b");
    expect(report).toContain("Front: What is churn?");
    expect(report).toContain("Back: Lost customers");
  });

  it("should say so plainly when nothing is a near-duplicate", () => {
    const report = formatNearDuplicateReport({
      subject: "Business",
      threshold: 0.85,
      scannedCards: 2,
      embeddedInMemory: 0,
      pairs: [],
    });

    expect(report).toContain("No near-duplicate pairs found.");
  });
});
