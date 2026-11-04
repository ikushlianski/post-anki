import { describe, expect, it } from "vitest";
import { detailLevelPromptLine, stripPromptHint } from "./subject-learning-settings";

describe("subject learning settings", () => {
  it("should add nothing to the prompt for the standard level or an unset level", () => {
    expect(detailLevelPromptLine("standard")).toBe("");
    expect(detailLevelPromptLine(null)).toBe("");
  });

  it("should give concise and deep levels one distinct line each", () => {
    expect(detailLevelPromptLine("concise")).toContain("concise");
    expect(detailLevelPromptLine("deep")).toContain("deep");
  });

  it("should remove the hint from a fill-in-the-blank prompt", () => {
    expect(stripPromptHint("A deal needs budget, ____ (hint: who signs) and need.")).toBe(
      "A deal needs budget, ____ and need.",
    );
  });
});
