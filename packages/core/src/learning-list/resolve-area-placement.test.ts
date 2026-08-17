import { describe, it, expect } from "vitest";
import type { TaxonomyArea } from "@post-anki/shared";
import { resolveAreaPlacement } from "./resolve-area-placement";

const reactAreas: TaxonomyArea[] = [
  { id: "area-1", name: "Components, JSX & Props" },
  { id: "area-3", name: "State Fundamentals" },
  { id: "area-4", name: "State Architecture" },
  { id: "area-6", name: "Effects & Synchronization" },
  { id: "area-11", name: "Other" },
];

describe("resolveAreaPlacement", () => {
  describe("when the proposed Area is real", () => {
    it("places the article in the Area the taxonomy already has", () => {
      expect(resolveAreaPlacement("Effects & Synchronization", reactAreas)).toBe("area-6");
    });

    it("still recognises the Area when the proposal differs in case, spacing and punctuation", () => {
      expect(resolveAreaPlacement("  effects & synchronization  ", reactAreas)).toBe("area-6");
      expect(resolveAreaPlacement("components jsx props", reactAreas)).toBe("area-1");
      expect(resolveAreaPlacement("STATE-FUNDAMENTALS", reactAreas)).toBe("area-3");
    });

    it("treats a reworded Area name as unmatched, so a near-miss lands in Other instead of the wrong Area", () => {
      expect(resolveAreaPlacement("Effects and Synchronization", reactAreas)).toBe("area-11");
    });

    it("does not let a partial name silently claim one of several similar Areas", () => {
      expect(resolveAreaPlacement("State", reactAreas)).toBe("area-11");
    });
  });

  describe("when the proposed Area does not exist", () => {
    it("lands an unclassifiable article in that sub-subject's Other rather than inventing an Area", () => {
      expect(resolveAreaPlacement("React Native Bridging", reactAreas)).toBe("area-11");
    });

    it("falls back to Other when the classifier proposed no Area at all", () => {
      expect(resolveAreaPlacement(null, reactAreas)).toBe("area-11");
      expect(resolveAreaPlacement("   ", reactAreas)).toBe("area-11");
    });

    it("never returns an id outside the taxonomy it was given", () => {
      const realIds = new Set(reactAreas.map((area) => area.id));
      const proposals = ["Security", "", "Other Stuff", "Effects & Synchronization", "unknown"];

      for (const proposal of proposals) {
        const placed = resolveAreaPlacement(proposal, reactAreas);

        expect(placed !== null && realIds.has(placed)).toBe(true);
      }
    });
  });

  describe("when the taxonomy itself is incomplete", () => {
    it("reports no placement rather than fabricating one when the sub-subject has no Other", () => {
      const withoutOther = reactAreas.filter((area) => area.name !== "Other");

      expect(resolveAreaPlacement("React Native Bridging", withoutOther)).toBe(null);
    });

    it("reports no placement when there are no Areas at all", () => {
      expect(resolveAreaPlacement("Effects & Synchronization", [])).toBe(null);
    });

    it("resolves duplicate Area names to the first one deterministically", () => {
      const duplicated: TaxonomyArea[] = [
        { id: "area-a", name: "Observability" },
        { id: "area-b", name: "observability" },
        { id: "area-other", name: "Other" },
      ];

      expect(resolveAreaPlacement("Observability", duplicated)).toBe("area-a");
    });
  });
});
