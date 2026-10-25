import { describe, expect, it } from "vitest";
import { hasPostgresErrorCode } from "./postgres-error-code.js";

describe("hasPostgresErrorCode", () => {
  it("should recognise a duplicate-key error raised directly by the driver", () => {
    expect(hasPostgresErrorCode({ code: "23505" }, "23505")).toBe(true);
  });

  it("should recognise a duplicate-key error the ORM wrapped as the cause of its own error", () => {
    expect(hasPostgresErrorCode(new Error("Failed query", { cause: { code: "23505" } }), "23505")).toBe(true);
  });

  it("should not treat other errors as a duplicate key", () => {
    expect(hasPostgresErrorCode(new Error("boom", { cause: { code: "40001" } }), "23505")).toBe(false);
    expect(hasPostgresErrorCode(undefined, "23505")).toBe(false);
  });
});
