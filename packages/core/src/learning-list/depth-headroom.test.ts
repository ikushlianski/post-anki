import { describe, it, expect } from "vitest";
import { deriveDepthHeadroom } from "./depth-headroom";

describe("deriveDepthHeadroom", () => {
  describe("when the topic was elected at basics", () => {
    it("records that the advanced level is still available above it", () => {
      expect(deriveDepthHeadroom("working", "deep")).toEqual({
        nextDepth: "deep",
        topDepth: "deep",
      });
    });

    it("answers this could go deeper without re-reading the source", () => {
      expect(deriveDepthHeadroom("working", "deep")).not.toBeNull();
    });
  });

  describe("when the topic was elected at the top of what the source offers", () => {
    it("reports no headroom for an advanced election", () => {
      expect(deriveDepthHeadroom("deep", "deep")).toBeNull();
    });

    it("reports no headroom when the source itself never went past basics", () => {
      expect(deriveDepthHeadroom("working", "working")).toBeNull();
    });

    it("reports no headroom when the election already exceeds what the source covers", () => {
      expect(deriveDepthHeadroom("deep", "working")).toBeNull();
      expect(deriveDepthHeadroom("working", "awareness")).toBeNull();
    });
  });

  describe("when several rungs of the ladder are unused", () => {
    it("offers the next rung up rather than jumping straight to the top", () => {
      expect(deriveDepthHeadroom("awareness", "deep")).toEqual({
        nextDepth: "working",
        topDepth: "deep",
      });
    });

    it("keeps the top of the ladder visible as what the source can ultimately support", () => {
      expect(deriveDepthHeadroom("awareness", "working")).toEqual({
        nextDepth: "working",
        topDepth: "working",
      });
    });
  });
});
