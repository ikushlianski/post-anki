import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = { DATABASE_URL: "postgres://x/y", OPENROUTER_API_KEY: "key" };
const SAVED = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...SAVED, ...BASE };
  delete process.env.CONNECTOR_SECRET_KEY;
});

afterEach(() => {
  process.env = SAVED;
});

async function boot() {
  const { loadEnv } = await import("./env.js");

  return loadEnv();
}

describe("CONNECTOR_SECRET_KEY", () => {
  it("should be optional so the API boots without a stored-token key", async () => {
    expect((await boot()).CONNECTOR_SECRET_KEY).toBeUndefined();
  });

  it("should accept a base64 key of 32 bytes", async () => {
    process.env.CONNECTOR_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");

    expect((await boot()).CONNECTOR_SECRET_KEY).toBeDefined();
  });

  it("should refuse a key of the wrong length so a weak key never encrypts a token", async () => {
    process.env.CONNECTOR_SECRET_KEY = Buffer.alloc(16, 7).toString("base64");

    await expect(boot()).rejects.toThrow(/CONNECTOR_SECRET_KEY/);
  });
});
