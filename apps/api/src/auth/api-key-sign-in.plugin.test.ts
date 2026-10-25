import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";

const { decideKeyEligibility, hashesMatch } = await import("./api-key-sign-in.plugin.js");
const { hashApiToken } = await import("../api-token/api-token.hash.js");

const NOW = "2026-10-25T10:00:00.000Z";

describe("key eligibility", () => {
  it("should accept an active key not linked to anyone", () => {
    expect(decideKeyEligibility({ revokedAt: null, userId: null }, "user_owner", NOW)).toBe(true);
  });

  it("should accept an active key linked to the owner", () => {
    expect(decideKeyEligibility({ revokedAt: null, userId: "user_owner" }, "user_owner", NOW)).toBe(true);
  });

  it("should refuse a key linked to a different user", () => {
    expect(decideKeyEligibility({ revokedAt: null, userId: "user_other" }, "user_owner", NOW)).toBe(false);
  });

  it("should refuse a key that was revoked in the past", () => {
    expect(decideKeyEligibility({ revokedAt: "2026-10-24T10:00:00.000Z", userId: null }, "user_owner", NOW)).toBe(false);
  });
});

describe("key hash comparison", () => {
  it("should match identical hashes and nothing else", () => {
    const hash = hashApiToken("pat_abc");

    expect(hashesMatch(hash, hash)).toBe(true);
    expect(hashesMatch(hashApiToken("pat_other"), hash)).toBe(false);
  });

  it("should never match when no stored hash exists", () => {
    expect(hashesMatch(undefined, "00".repeat(32))).toBe(false);
  });

  it("should not match a hash of the wrong length", () => {
    expect(hashesMatch("abcd", hashApiToken("x"))).toBe(false);
  });
});
