import { describe, expect, it } from "vitest";
import { isWellFormedFillBlankPrompt } from "./knowledge-bit-fill-blank-prompt-validation.js";

describe("isWellFormedFillBlankPrompt", () => {
  it("should accept a sentence with exactly one standalone blank", () => {
    expect(
      isWellFormedFillBlankPrompt("Метафора «клиентская боль» не существует в мире ____."),
    ).toBe(true);
  });

  it("should reject a sentence with two blanks", () => {
    expect(isWellFormedFillBlankPrompt("____ synthesize ____ in the cell.")).toBe(false);
  });

  it("should reject a sentence with no blank", () => {
    expect(isWellFormedFillBlankPrompt("Ribosomes synthesize proteins.")).toBe(false);
  });

  it("should reject a blank glued to a letter", () => {
    expect(isWellFormedFillBlankPrompt("Ribosomes synthesize pro____ in the cell.")).toBe(false);
  });

  it("should reject a blank of the wrong length", () => {
    expect(isWellFormedFillBlankPrompt("Ribosomes synthesize ______ in the cell.")).toBe(false);
  });
});
