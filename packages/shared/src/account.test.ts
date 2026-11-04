import { describe, expect, it } from "vitest";
import { ACCOUNT_NAME_MAX_LENGTH, updateAccountInputSchema } from "./account";

describe("updateAccountInputSchema", () => {
  it("should trim surrounding spaces from a display name before saving", () => {
    expect(updateAccountInputSchema.parse({ name: "  Ilya  " })).toEqual({ name: "Ilya" });
  });

  it("should reject a name that is only spaces", () => {
    expect(updateAccountInputSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("should accept an 80 character name and reject 81", () => {
    expect(updateAccountInputSchema.safeParse({ name: "a".repeat(ACCOUNT_NAME_MAX_LENGTH) }).success).toBe(true);
    expect(updateAccountInputSchema.safeParse({ name: "a".repeat(ACCOUNT_NAME_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it("should reject attempts to change other account fields such as email", () => {
    expect(updateAccountInputSchema.safeParse({ name: "Ilya", email: "x@y.z" }).success).toBe(false);
  });
});
