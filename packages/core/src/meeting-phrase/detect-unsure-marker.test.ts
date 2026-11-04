import { describe, expect, it } from "vitest";
import { detectUnsureMarker } from "./detect-unsure-marker.js";

describe("detectUnsureMarker", () => {
  it("should flag every question-mark style marker the learner uses for doubt and strip it", () => {
    for (const marked of ["wrap it up???", "wrap it up ????", "wrap it up ?!??", "wrap it up (?)", "wrap it up (??)"]) {
      expect(detectUnsureMarker(marked)).toEqual({ text: "wrap it up", unsure: true });
    }
  });

  it("should leave phrases without a marker untouched", () => {
    expect(detectUnsureMarker("what do you mean?")).toEqual({ text: "what do you mean?", unsure: false });
    expect(detectUnsureMarker("wrap it up")).toEqual({ text: "wrap it up", unsure: false });
  });

  it("should not flag a phrase that only has one or two question marks", () => {
    for (const plain of ["really??", "really ?!?", "really?!"]) {
      expect(detectUnsureMarker(plain)).toEqual({ text: plain, unsure: false });
    }
  });

  it("should strip a marker in the middle of the text and keep the rest", () => {
    expect(detectUnsureMarker("touch ??? base")).toEqual({ text: "touch base", unsure: true });
  });
});
