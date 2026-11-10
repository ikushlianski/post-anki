import { describe, expect, it } from "vitest";
import { CLOZE_AI_STATEMENT_MAX_CHARS } from "@post-anki/shared";
import { isValidAiCloze } from "./knowledge-bit-cloze-validation.js";

function clozeOfLength(length: number): { note: string; statement: string } {
  const filler = "a".repeat(length - "Salt ".length - " water".length);
  const statement = `Salt ${filler} water`;

  return { note: `{{c1::Salt}} ${filler} {{c2::water}}`, statement };
}

describe("isValidAiCloze statement length", () => {
  it("should accept a cloze statement at the character cap", () => {
    const { note, statement } = clozeOfLength(CLOZE_AI_STATEMENT_MAX_CHARS);

    expect(isValidAiCloze(note, statement, statement)).toBe(true);
  });

  it("should reject a cloze statement one character over the cap", () => {
    const { note, statement } = clozeOfLength(CLOZE_AI_STATEMENT_MAX_CHARS + 1);

    expect(isValidAiCloze(note, statement, statement)).toBe(false);
  });
});
