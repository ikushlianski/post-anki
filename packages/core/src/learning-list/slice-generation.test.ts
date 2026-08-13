import { describe, it, expect } from "vitest";
import { QUESTIONS_PER_TOPIC } from "./generation-constants";
import { truncateSliceGeneration, type GeneratedTopicCandidate } from "./slice-generation";

function topic(
  title: string,
  gapLabels: string[],
  summary: string | null = null,
): GeneratedTopicCandidate {
  return {
    title,
    summary,
    gaps: gapLabels.map((label) => ({ label, depth: "working" as const })),
  };
}

describe("truncateSliceGeneration", () => {
  describe("when the model proposes more than the slice asked for", () => {
    it("caps the topic count to topicCount", () => {
      const raw = [topic("A", ["g1"]), topic("B", ["g2"]), topic("C", ["g3"]), topic("D", ["g4"])];

      const result = truncateSliceGeneration(raw, 2, 10);

      expect(result.map((t) => t.title)).toEqual(["A", "B"]);
    });

    it("caps each topic's gaps to QUESTIONS_PER_TOPIC", () => {
      const raw = [topic("A", ["g1", "g2", "g3", "g4"])];

      const result = truncateSliceGeneration(raw, 5, 100);

      expect(result[0]?.gaps).toHaveLength(QUESTIONS_PER_TOPIC);
    });

    it("caps the running total of gaps across topics to questionCount, dropping the shortfall", () => {
      const raw = [topic("A", ["g1", "g2"]), topic("B", ["g3", "g4"]), topic("C", ["g5", "g6"])];

      const result = truncateSliceGeneration(raw, 5, 3);
      const totalGaps = result.reduce((sum, t) => sum + t.gaps.length, 0);

      expect(totalGaps).toBe(3);
    });
  });

  describe("when the model produces junk", () => {
    it("drops a topic with a blank title", () => {
      const raw = [topic("", ["g1"]), topic("Real topic", ["g2"])];

      const result = truncateSliceGeneration(raw, 5, 10);

      expect(result.map((t) => t.title)).toEqual(["Real topic"]);
    });

    it("drops a topic whose gaps are all blank labels", () => {
      const raw = [topic("Empty", ["", "  "]), topic("Real", ["g1"])];

      const result = truncateSliceGeneration(raw, 5, 10);

      expect(result.map((t) => t.title)).toEqual(["Real"]);
    });

    it("trims whitespace from titles and gap labels", () => {
      const raw = [topic("  Spacey Title  ", ["  spaced gap  "])];

      const result = truncateSliceGeneration(raw, 5, 10);

      expect(result[0]?.title).toBe("Spacey Title");
      expect(result[0]?.gaps[0]?.label).toBe("spaced gap");
    });
  });

  describe("the shape handed to the write path", () => {
    it("never exceeds topicCount topics or questionCount total gaps", () => {
      const raw = Array.from({ length: 10 }, (_, i) => topic(`Topic ${i}`, ["g1", "g2", "g3"]));

      const result = truncateSliceGeneration(raw, 3, 5);
      const totalGaps = result.reduce((sum, t) => sum + t.gaps.length, 0);

      expect(result.length).toBeLessThanOrEqual(3);
      expect(totalGaps).toBeLessThanOrEqual(5);
    });

    it("returns an empty array when nothing survives cleaning", () => {
      const raw = [topic("", [""]), topic("  ", ["  "])];

      expect(truncateSliceGeneration(raw, 3, 10)).toEqual([]);
    });
  });
});
