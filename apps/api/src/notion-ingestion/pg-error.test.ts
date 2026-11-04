import { describe, expect, it } from "vitest";
import { hasPgErrorCode, PG_UNIQUE_VIOLATION } from "./pg-error.js";

describe("hasPgErrorCode", () => {
  it("should find the code on a wrapped driver error", () => {
    expect(hasPgErrorCode(new Error("x", { cause: { code: PG_UNIQUE_VIOLATION } }), PG_UNIQUE_VIOLATION)).toBe(true);
  });

  it("should not match a different code or a non-error", () => {
    expect(hasPgErrorCode({ code: "42P01" }, PG_UNIQUE_VIOLATION)).toBe(false);
    expect(hasPgErrorCode(undefined, PG_UNIQUE_VIOLATION)).toBe(false);
  });
});
