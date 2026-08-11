import { describe, it, expect } from "vitest";
import { recommendDestination } from "./recommend-destination";

const reactEffectsArea = { areaId: "area-react-effects", areaName: "Effects & Synchronization" };

const startedCourse = { curriculumId: "cur-1", title: "Agentic AI on AWS" };

describe("recommendDestination", () => {
  describe("a single article", () => {
    it("is folded into the existing taxonomy rather than becoming a course", () => {
      expect(recommendDestination("single", reactEffectsArea, null)).toBe("fold_in");
    });

    it("is still folded in when no Area was matched, because placement resolves separately", () => {
      expect(recommendDestination("single", null, null)).toBe("fold_in");
    });

    it("never becomes a mini-course or an extend, even when it looks like an existing curriculum", () => {
      expect(recommendDestination("single", reactEffectsArea, startedCourse)).toBe("fold_in");
    });
  });

  describe("a confirmed multi-part series", () => {
    it("is proposed as a mini-course awaiting approval when nothing matches it already", () => {
      expect(recommendDestination("series", reactEffectsArea, null)).toBe("mini_course");
    });

    it("offers to extend the matched curriculum instead of spawning a second one", () => {
      expect(recommendDestination("series", reactEffectsArea, startedCourse)).toBe(
        "extend_curriculum",
      );
    });

    it("still offers to extend even when no Area was matched", () => {
      expect(recommendDestination("series", null, startedCourse)).toBe("extend_curriculum");
    });
  });

  describe("an unresolved page", () => {
    it("is parked for the user to decide instead of being guessed into a course", () => {
      expect(recommendDestination("unknown", reactEffectsArea, null)).toBe("park");
    });

    it("is parked regardless of what else was matched", () => {
      expect(recommendDestination("unknown", null, startedCourse)).toBe("park");
    });
  });

  it("only ever proposes a mini-course or an extend for a confirmed series", () => {
    const destinations = (["single", "unknown"] as const).map((verdict) =>
      recommendDestination(verdict, reactEffectsArea, startedCourse),
    );

    expect(destinations).not.toContain("mini_course");
    expect(destinations).not.toContain("extend_curriculum");
  });
});
