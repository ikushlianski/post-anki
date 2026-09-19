import { describe, expect, it } from "vitest";
import { extractTag } from "./extract-tag.js";

describe("extractTag", () => {
  it("reads a leading hash tag and strips it from the body", () => {
    expect(extractTag("#SPA Closures capture their lexical scope")).toEqual({
      tag: "SPA",
      body: "Closures capture their lexical scope",
    });
  });

  it("reads a leading bracketed tag", () => {
    expect(extractTag("[CRM] Follow up with the pilot customer")).toEqual({
      tag: "CRM",
      body: "Follow up with the pilot customer",
    });
  });

  it("reads a leading colon tag", () => {
    expect(extractTag("SPA: Prefer composition over inheritance")).toEqual({
      tag: "SPA",
      body: "Prefer composition over inheritance",
    });
  });

  it("leaves an untagged note alone", () => {
    expect(extractTag("  Just a thought  ")).toEqual({ tag: null, body: "Just a thought" });
  });

  it("does not treat a lowercase or mid-sentence token as a tag", () => {
    expect(extractTag("#spa lowercase is prose").tag).toBeNull();
    expect(extractTag("A note about CRM: systems").tag).toBeNull();
  });

  it("does not treat a hashtag glued to a word as a tag", () => {
    expect(extractTag("#SPAcious rooms").tag).toBeNull();
  });
});
