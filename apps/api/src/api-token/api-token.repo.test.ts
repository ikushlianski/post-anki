import { describe, it, expect, vi } from "vitest";
import { isTokenActive } from "./api-token.repo.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn, debug: vi.fn() },
}));

vi.mock("../db/client.js", () => ({
  getDb: () => ({
    update: () => ({
      set: () => ({
        where: () => Promise.reject(new Error("db connection dropped")),
      }),
    }),
  }),
}));

describe("touchLastUsed", () => {
  it("swallows a DB error instead of rejecting, and logs it", async () => {
    const { touchLastUsed } = await import("./api-token.repo.js");

    await expect(touchLastUsed("tok_1")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tok_1" }),
      "touch_last_used_failed",
    );
  });
});

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
