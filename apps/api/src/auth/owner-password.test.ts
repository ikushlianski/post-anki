import { describe, expect, it } from "vitest";
import { describePasswordProblem, validateNewPassword } from "./owner-password.js";

describe("new owner password rules", () => {
  it("should accept a matching password of at least 8 characters", () => {
    expect(validateNewPassword("eight-ch", "eight-ch")).toEqual({ ok: true });
  });

  it("should refuse a 7 character password so a weak one is never stored", () => {
    expect(validateNewPassword("seven-c", "seven-c")).toEqual({ ok: false, reason: "too_short" });
  });

  it("should refuse a confirmation that differs", () => {
    expect(validateNewPassword("eight-ch", "eight-cX")).toEqual({ ok: false, reason: "mismatch" });
  });

  it("should refuse an absurdly long password", () => {
    const long = "a".repeat(129);

    expect(validateNewPassword(long, long)).toEqual({ ok: false, reason: "too_long" });
  });

  it("should describe each problem without echoing the password", () => {
    expect(describePasswordProblem("too_short")).toContain("8");
    expect(describePasswordProblem("mismatch")).toBe("Passwords do not match");
  });
});
