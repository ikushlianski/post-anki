import { describe, expect, it } from "vitest";
import { cardKeyFor, cardKeySchema, isIndependentCardKind } from "./card-key";

describe("card key", () => {
  it("should give each cloze gap and list step its own slot key", () => {
    expect(cardKeyFor({ kind: "cloze", order: 2 })).toBe("cloze:2");
    expect(cardKeyFor({ kind: "list_step", order: 3 })).toBe("list_step:3");
    expect(cardKeyFor({ kind: "list_next", order: 1 })).toBe("list_next:1");
    expect(cardKeyFor({ kind: "list_overview", order: 0 })).toBe("list_overview:0");
  });

  it("should keep one note-level schedule for basic, wh and fill-in cards whatever their order", () => {
    expect(cardKeyFor({ kind: "basic", order: 4 })).toBe("");
    expect(cardKeyFor({ kind: "wh_question", order: 1 })).toBe("");
    expect(cardKeyFor({ kind: "fill_in_the_blank", order: 2 })).toBe("");
    expect(isIndependentCardKind("basic")).toBe(false);
  });

  it("should accept only the legacy empty key and well-formed slot keys", () => {
    expect(cardKeySchema.safeParse("").success).toBe(true);
    expect(cardKeySchema.safeParse("cloze:12").success).toBe(true);
    expect(cardKeySchema.safeParse("basic:1").success).toBe(false);
    expect(cardKeySchema.safeParse("cloze:").success).toBe(false);
  });
});
