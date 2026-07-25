import { describe, it, expect } from "vitest";
import { isTokenActive } from "./api-token.repo.js";

describe("isTokenActive", () => {
  it("is active when never revoked", () => {
    expect(isTokenActive({ revokedAt: null }, "2026-07-17T00:00:00.000Z")).toBe(true);
  });

  it("is inactive once the revocation moment has passed", () => {
    const revokedAt = "2026-07-01T00:00:00.000Z";
    const now = "2026-07-17T00:00:00.000Z";

    expect(isTokenActive({ revokedAt }, now)).toBe(false);
  });

  it("is inactive exactly at the revocation moment", () => {
    const revokedAt = "2026-07-17T00:00:00.000Z";

    expect(isTokenActive({ revokedAt }, revokedAt)).toBe(false);
  });

  it("is still active before a future-scheduled revocation takes effect", () => {
    const revokedAt = "2026-08-01T00:00:00.000Z";
    const now = "2026-07-17T00:00:00.000Z";

    expect(isTokenActive({ revokedAt }, now)).toBe(true);
  });
});
