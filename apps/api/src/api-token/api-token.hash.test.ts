import { describe, it, expect } from "vitest";
import { hashApiToken } from "./api-token.hash.js";

describe("hashApiToken", () => {
  it("produces the same hash for the same raw token", () => {
    const raw = "pat_abc123";

    expect(hashApiToken(raw)).toBe(hashApiToken(raw));
  });

  it("produces different hashes for different raw tokens", () => {
    expect(hashApiToken("pat_one")).not.toBe(hashApiToken("pat_two"));
  });

  it("never returns the raw token value itself", () => {
    const raw = "pat_super_secret_value";

    expect(hashApiToken(raw)).not.toBe(raw);
  });

  it("produces a 64-character hex digest (sha256)", () => {
    const digest = hashApiToken("pat_anything");

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
