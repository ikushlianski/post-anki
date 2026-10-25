import { describe, expect, it } from "vitest";
import { describePasswordProblem, validateNewPassword } from "./owner-password.js";

describe("new owner password rules", () => {
  it("should accept a matching password of at least 12 characters", () => {
    expect(validateNewPassword("twelve-chars", "twelve-chars")).toEqual({ ok: true });
  });

  it("should refuse an 11 character password so a weak one is never stored", () => {
    expect(validateNewPassword("eleven-char", "eleven-char")).toEqual({ ok: false, reason: "too_short" });
  });

  it("should refuse a confirmation that differs", () => {
    expect(validateNewPassword("twelve-chars", "twelve-charX")).toEqual({ ok: false, reason: "mismatch" });
  });

  it("should refuse an absurdly long password", () => {
    const long = "a".repeat(129);

    expect(validateNewPassword(long, long)).toEqual({ ok: false, reason: "too_long" });
  });

  it("should describe each problem without echoing the password", () => {
    expect(describePasswordProblem("too_short")).toContain("12");
    expect(describePasswordProblem("mismatch")).toBe("Passwords do not match");
  });
});
