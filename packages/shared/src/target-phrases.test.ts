import { describe, expect, it } from "vitest";
import { targetPhrasesSchema, isEnglishSubject, normalizeTargetPhrases } from "./target-phrases";

const subjects = [
  { id: "en", name: "English", parentId: null },
  { id: "en-idioms", name: "Idioms", parentId: "en" },
  { id: "en-deep", name: "Phrasal", parentId: "en-idioms" },
  { id: "de", name: "German", parentId: null },
  { id: "de-verbs", name: "Verbs", parentId: "de" },
  { id: "loop-a", name: "A", parentId: "loop-b" },
  { id: "loop-b", name: "B", parentId: "loop-a" },
];

describe("targetPhrasesSchema", () => {
  it("should trim phrases and accept up to five", () => {
    expect(targetPhrasesSchema.parse(["  break a leg "])).toEqual(["break a leg"]);
    expect(targetPhrasesSchema.safeParse(["a", "b", "c", "d", "e", "f"]).success).toBe(false);
  });

  it("should reject blank and over-long phrases", () => {
    expect(targetPhrasesSchema.safeParse(["   "]).success).toBe(false);
    expect(targetPhrasesSchema.safeParse(["x".repeat(201)]).success).toBe(false);
    expect(targetPhrasesSchema.safeParse(["x".repeat(200)]).success).toBe(true);
  });
});

describe("normalizeTargetPhrases", () => {
  it("should trim, drop empties and dedupe case-insensitively", () => {
    expect(normalizeTargetPhrases([" Foo ", "", "foo", "Bar"])).toEqual(["Foo", "Bar"]);
  });

  it("should return null when nothing is left", () => {
    expect(normalizeTargetPhrases(["  ", ""])).toBeNull();
    expect(normalizeTargetPhrases([])).toBeNull();
    expect(normalizeTargetPhrases(undefined)).toBeNull();
  });
});

describe("isEnglishSubject", () => {
  it("should be true for English and any descendant", () => {
    expect(isEnglishSubject("en", subjects)).toBe(true);
    expect(isEnglishSubject("en-deep", subjects)).toBe(true);
  });

  it("should be false for other roots, missing ids and no subject", () => {
    expect(isEnglishSubject("de-verbs", subjects)).toBe(false);
    expect(isEnglishSubject("nope", subjects)).toBe(false);
    expect(isEnglishSubject(null, subjects)).toBe(false);
    expect(isEnglishSubject(undefined, subjects)).toBe(false);
  });

  it("should terminate on a parent cycle", () => {
    expect(isEnglishSubject("loop-a", subjects)).toBe(false);
  });
});
