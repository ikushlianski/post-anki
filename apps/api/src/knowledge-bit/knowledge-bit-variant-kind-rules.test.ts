import { describe, expect, it } from "vitest";
import { ankiVariantKindRank, isTypedVariantKind } from "./knowledge-bit-variant-kind-rules.js";

describe("variant kind rules", () => {
  it("should rank basic before cloze before fill in the blank before why question for Anki review", () => {
    expect(ankiVariantKindRank("basic")).toBe(0);
    expect(ankiVariantKindRank("cloze")).toBe(1);
    expect(ankiVariantKindRank("fill_in_the_blank")).toBe(2);
    expect(ankiVariantKindRank("wh_question")).toBe(3);
  });

  it("should rank list cards after the single-sentence kinds, overview first", () => {
    expect(ankiVariantKindRank("list_overview")).toBe(4);
    expect(ankiVariantKindRank("list_step")).toBe(5);
    expect(ankiVariantKindRank("list_next")).toBe(6);
  });

  it("should serve only why and fill-in-the-blank cards in typed mode", () => {
    expect(isTypedVariantKind("wh_question")).toBe(true);
    expect(isTypedVariantKind("fill_in_the_blank")).toBe(true);
    expect(isTypedVariantKind("basic")).toBe(false);
    expect(isTypedVariantKind("cloze")).toBe(false);
    expect(isTypedVariantKind("list_step")).toBe(false);
    expect(isTypedVariantKind("list_next")).toBe(false);
    expect(isTypedVariantKind("list_overview")).toBe(false);
  });
});
