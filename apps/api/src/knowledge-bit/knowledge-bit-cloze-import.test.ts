import { describe, expect, it } from "vitest";
import { CLOZE_NOTE_MAX_CHARS } from "@post-anki/shared";
import { cutImportedClozeExample, detectImportedCloze, isImportedClozeSource } from "./knowledge-bit-cloze-import.js";

describe("detectImportedCloze", () => {
  it("should keep two gaps and a hint in one cloze card", () => {
    const note = "A deal needs {{c1::budget::money}} and {{c2::authority}}.";
    const draft = detectImportedCloze(note);

    expect(draft).toEqual({
      statement: "A deal needs budget and authority.",
      quote: "A deal needs budget and authority.",
      example: null,
      cards: [
        {
          kind: "cloze",
          question: note,
          answer: "budget / authority",
          statement: "A deal needs budget and authority.",
          quote: "A deal needs budget and authority.",
        },
      ],
    });
  });

  it("should treat a Back Extra remainder as the example", () => {
    const draft = detectImportedCloze("The {{c1::heart}} pumps blood.\n\nBack Extra: it has four chambers.");

    expect(draft?.example).toBe("Back Extra: it has four chambers.");
    expect(draft?.statement).toBe("The heart pumps blood.");
  });

  it("should cut a long remainder at 200 characters", () => {
    const draft = detectImportedCloze(`The {{c1::heart}} pumps blood.\n${"x".repeat(500)}`);

    expect(draft?.example).toHaveLength(200);
  });

  it("should keep a single-gap note as cloze", () => {
    expect(detectImportedCloze("Paris is in {{c1::France}}.")?.cards[0]?.answer).toBe("France");
  });

  it("should return null for prose", () => {
    expect(detectImportedCloze("HTTP is a stateless protocol.")).toBeNull();
  });

  it("should return null for a nested gap", () => {
    expect(detectImportedCloze("A {{c1::b {{c2::c}}}} d.")).toBeNull();
  });

  it("should return null for an unclosed gap", () => {
    expect(detectImportedCloze("A {{c1::b and c.")).toBeNull();
  });

  it("should return null for a note over the cap", () => {
    expect(detectImportedCloze(`${"a ".repeat(CLOZE_NOTE_MAX_CHARS)}{{c1::b}}`)).toBeNull();
  });

  it("should return null when removing the markers creates markup that was not in the text", () => {
    expect(detectImportedCloze("See <{{c1::b}}old> now.")).toBeNull();
  });

  it("should return null when the plain statement is over the statement cap", () => {
    expect(detectImportedCloze(`${"a ".repeat(400)}{{c1::b}}`)).toBeNull();
  });
});

describe("cutImportedClozeExample", () => {
  it("should keep a short example whole", () => {
    expect(cutImportedClozeExample("  Short extra.  ")).toBe("Short extra.");
  });

  it("should end a long example at the last full sentence within the limit", () => {
    const text = `${"a".repeat(60)} one. ${"b".repeat(60)} two. ${"c".repeat(80)} three.`;
    const cut = cutImportedClozeExample(text);

    expect(cut.endsWith("two.")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(200);
  });

  it("should end at a word boundary when no sentence end sits past the middle", () => {
    const text = Array.from({ length: 80 }, () => "word").join(" ");
    const cut = cutImportedClozeExample(text);

    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut.split(" ").every((word) => word === "word")).toBe(true);
  });

  it("should cut at exactly 200 characters when the text has no whitespace", () => {
    expect(cutImportedClozeExample("x".repeat(500))).toHaveLength(200);
  });

  it("should not cut inside a decimal number", () => {
    const text = `${"a".repeat(130)} 3.14${"b".repeat(100)}`;
    const cut = cutImportedClozeExample(text);

    expect(cut).not.toMatch(/3\.$/);
    expect(cut).toBe("a".repeat(130));
  });

  it("should ignore an early sentence end and fall back to a word boundary", () => {
    const text = `Hi. ${Array.from({ length: 80 }, () => "word").join(" ")}`;
    const cut = cutImportedClozeExample(text);

    expect(cut.length).toBeGreaterThan(150);
    expect(cut.endsWith("word")).toBe(true);
  });
});

describe("isImportedClozeSource", () => {
  it("should recognise a long cloze note whose first chunk holds the gaps", () => {
    const text = `Deal needs {{c1::budget}}.\n\n${"extra ".repeat(1000)}\n\n${"more ".repeat(1000)}`;

    expect(isImportedClozeSource(text)).toBe(true);
  });

  it("should reject prose without gaps", () => {
    expect(isImportedClozeSource("Just prose here.")).toBe(false);
  });
});
