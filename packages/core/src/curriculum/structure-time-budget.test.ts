import { describe, it, expect } from "vitest";
import { buildScopeGrowthNote, estimateStructureStudyTime } from "./structure-time-budget";

describe("estimateStructureStudyTime", () => {
  describe("a modest curriculum", () => {
    it("estimates a small number of weeks proportional to topic count", () => {
      const estimate = estimateStructureStudyTime([
        { topics: [{}, {}, {}] },
        { topics: [{}, {}] },
      ]);

      expect(estimate.totalModules).toBe(2);
      expect(estimate.totalTopics).toBe(5);
      expect(estimate.estimatedWeeks).toBeGreaterThan(0);
      expect(estimate.estimatedWeeks).toBeLessThanOrEqual(3);
    });
  });

  describe("a curriculum with a topic-less module", () => {
    it("still counts study time for it instead of contributing zero", () => {
      const withTopiclessModule = estimateStructureStudyTime([{ topics: [] }]);
      const empty = estimateStructureStudyTime([]);

      expect(withTopiclessModule.estimatedHours).toBeGreaterThan(0);
      expect(withTopiclessModule.estimatedHours).toBeGreaterThan(empty.estimatedHours);
    });
  });

  describe("no modules at all", () => {
    it("still returns at least one week, never zero", () => {
      expect(estimateStructureStudyTime([]).estimatedWeeks).toBe(1);
    });
  });

  describe("a sprawling curriculum with many modules and topics", () => {
    it("estimates well past the 4-8 week target", () => {
      const bigModules = Array.from({ length: 10 }, () => ({
        topics: Array.from({ length: 6 }, () => ({})),
      }));

      expect(estimateStructureStudyTime(bigModules).estimatedWeeks).toBeGreaterThan(8);
    });
  });
});

describe("buildScopeGrowthNote", () => {
  describe("a regeneration that stays within the 4-8 week target", () => {
    it("says nothing", () => {
      const previous = estimateStructureStudyTime([{ topics: [{}, {}] }]);
      const next = estimateStructureStudyTime([{ topics: [{}, {}, {}] }]);

      expect(buildScopeGrowthNote(previous, next)).toBeNull();
    });
  });

  describe("a regeneration that pushes the course meaningfully past budget", () => {
    it("returns a plain-language nudge naming the new estimate", () => {
      const previous = estimateStructureStudyTime([{ topics: [{}, {}] }]);
      const bigModules = Array.from({ length: 10 }, () => ({
        topics: Array.from({ length: 6 }, () => ({})),
      }));
      const next = estimateStructureStudyTime(bigModules);

      const note = buildScopeGrowthNote(previous, next);

      expect(note).not.toBeNull();
      expect(note).toContain(`${next.estimatedWeeks} weeks`);
    });
  });

  describe("a regeneration that trims scope back down", () => {
    it("says nothing, even if the result is still large", () => {
      const bigModules = Array.from({ length: 10 }, () => ({
        topics: Array.from({ length: 6 }, () => ({})),
      }));
      const previous = estimateStructureStudyTime(bigModules);
      const next = estimateStructureStudyTime(bigModules.slice(0, 9));

      expect(buildScopeGrowthNote(previous, next)).toBeNull();
    });
  });
});
