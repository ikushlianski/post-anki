import { describe, it, expect } from "vitest";
import { levelBadgeLabel } from "./level-badge.js";

describe("levelBadgeLabel", () => {
  describe("a module tagged with a tier", () => {
    it("renders a badge for basic, medium, and advanced", () => {
      expect(levelBadgeLabel("basic")).toBe("🔰 Basic");
      expect(levelBadgeLabel("medium")).toBe("🧭 Medium");
      expect(levelBadgeLabel("advanced")).toBe("🚀 Advanced");
    });
  });

  describe("a module with no tier (pasted-material flow)", () => {
    it("renders nothing", () => {
      expect(levelBadgeLabel(null)).toBeNull();
    });
  });
});
