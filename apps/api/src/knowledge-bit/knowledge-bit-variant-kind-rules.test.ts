import { describe, expect, it } from "vitest";
import { ankiVariantKindRank, isTypedVariantKind } from "./knowledge-bit-variant-kind-rules.js";

describe("variant kind rules", () => {
  it("should rank basic before fill in the blank before why question for Anki review", () => {
    expect(ankiVariantKindRank("basic")).toBe(0);
    expect(ankiVariantKindRank("fill_in_the_blank")).toBe(1);
    expect(ankiVariantKindRank("wh_question")).toBe(2);
  });

  it("should serve only why and fill-in-the-blank cards in typed mode", () => {
    expect(isTypedVariantKind("wh_question")).toBe(true);
    expect(isTypedVariantKind("fill_in_the_blank")).toBe(true);
    expect(isTypedVariantKind("basic")).toBe(false);
  });
});
