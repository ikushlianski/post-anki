import { describe, expect, it } from "vitest";
import { ankiNoteTextKey } from "./anki-note-text-key.js";

describe("ankiNoteTextKey", () => {
  it("should give the same key to a sentence whatever word is blanked", () => {
    expect(ankiNoteTextKey("{{c1::маржа}} это прибыль первого уровня")).toBe(
      ankiNoteTextKey("Маржа это {{c2::прибыль}} первого уровня"),
    );
  });

  it("should drop the hint of a cloze and keep its answer", () => {
    expect(ankiNoteTextKey("The {{c1::sky::colour}} is blue")).toBe("the sky is blue");
  });

  it("should ignore case and extra whitespace", () => {
    expect(ankiNoteTextKey("  Hello \n  {{c1::World}}  ")).toBe("hello world");
  });

  it("should keep different sentences apart", () => {
    expect(ankiNoteTextKey("{{c1::a}} b")).not.toBe(ankiNoteTextKey("{{c1::a}} c"));
  });
});
