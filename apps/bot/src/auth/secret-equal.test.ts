import { describe, expect, it } from "vitest";
import { secretsEqual } from "./secret-equal.js";

describe("secretsEqual", () => {
  it("should accept an identical secret", () => {
    expect(secretsEqual("Bearer abc", "Bearer abc")).toBe(true);
  });

  it("should reject a different secret of the same length", () => {
    expect(secretsEqual("Bearer abd", "Bearer abc")).toBe(false);
  });

  it("should reject a secret of a different length without throwing", () => {
    expect(secretsEqual("Bearer abcd", "Bearer abc")).toBe(false);
  });

  it("should reject a missing or repeated header", () => {
    expect(secretsEqual(undefined, "x")).toBe(false);
    expect(secretsEqual(["x", "x"], "x")).toBe(false);
  });
});
