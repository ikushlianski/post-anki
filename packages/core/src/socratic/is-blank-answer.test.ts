import { describe, it, expect } from "vitest";
import { isBlankAnswer } from "./is-blank-answer";

describe("isBlankAnswer", () => {
  it("treats an empty string as blank", () => {
    expect(isBlankAnswer("")).toBe(true);
  });

  it("treats whitespace-only input as blank", () => {
    expect(isBlankAnswer("   \n\t  ")).toBe(true);
  });

  it("does not treat a low-effort but non-empty answer as blank", () => {
    expect(isBlankAnswer("idk")).toBe(false);
  });

  it("does not treat a single non-whitespace character as blank", () => {
    expect(isBlankAnswer("?")).toBe(false);
  });

  it("does not treat a normal answer as blank", () => {
    expect(isBlankAnswer("It amortizes the cost across requests.")).toBe(false);
  });
});
