import { describe, expect, it } from "vitest";
import { TAG_TAXONOMY_CAP, buildTagMatchPrompt, isUnderTaxonomyCap } from "./tag-auto-assign.js";

describe("isUnderTaxonomyCap", () => {
  it("should report under cap when the tag count is below the default cap", () => {
    expect(isUnderTaxonomyCap(TAG_TAXONOMY_CAP - 1)).toBe(true);
  });

  it("should report at cap when the tag count equals the cap", () => {
    expect(isUnderTaxonomyCap(TAG_TAXONOMY_CAP)).toBe(false);
  });

  it("should report over cap when the tag count exceeds the cap", () => {
    expect(isUnderTaxonomyCap(TAG_TAXONOMY_CAP + 1)).toBe(false);
  });

  it("should honor a custom cap", () => {
    expect(isUnderTaxonomyCap(20, 20)).toBe(false);
  });
});

describe("buildTagMatchPrompt", () => {
  it("should tell the model to allow no-match when under the cap", () => {
    const prompt = buildTagMatchPrompt("negotiation", undefined, ["sales"], false);

    expect(prompt).toContain("say no match");
  });

  it("should tell the model a match is mandatory when at the cap", () => {
    const prompt = buildTagMatchPrompt("negotiation", undefined, ["sales"], true);

    expect(prompt).toContain("must pick the single nearest existing tag");
  });

  it("should include the context when given", () => {
    const prompt = buildTagMatchPrompt("negotiation", "from a sales chapter", ["sales"], false);

    expect(prompt).toContain("from a sales chapter");
  });

  it("should list every existing tag name", () => {
    const prompt = buildTagMatchPrompt("negotiation", undefined, ["sales", "pricing"], false);

    expect(prompt).toContain("- sales");
    expect(prompt).toContain("- pricing");
  });
});
