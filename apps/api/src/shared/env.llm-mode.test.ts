import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAVED = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...SAVED, DATABASE_URL: "postgres://x/y" };
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.LLM_MODE;
  delete process.env.MOCK_LLM_PORT;
});

afterEach(() => {
  process.env = SAVED;
});

async function boot() {
  const { loadEnv } = await import("./env.js");

  return loadEnv();
}

describe("LLM mode boot config", () => {
  it("should let a developer boot with no OpenRouter key when mock mode is on", async () => {
    process.env.LLM_MODE = "mock";

    const env = await boot();

    expect(env.OPENROUTER_API_KEY).toBeTruthy();
  });

  it("should point all LLM calls at the local mock server in mock mode", async () => {
    process.env.LLM_MODE = "mock";
    process.env.MOCK_LLM_PORT = "4123";

    expect((await boot()).OPENROUTER_BASE_URL).toBe("http://127.0.0.1:4123/v1");
  });

  it("should keep an explicitly configured base URL in mock mode", async () => {
    process.env.LLM_MODE = "mock";
    process.env.OPENROUTER_BASE_URL = "http://localhost:9/v1";

    expect((await boot()).OPENROUTER_BASE_URL).toBe("http://localhost:9/v1");
  });

  it("should refuse to boot in real mode without a key so paid calls never fail silently", async () => {
    await expect(boot()).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("should refuse a blank key in explicit real mode", async () => {
    process.env.LLM_MODE = "real";
    process.env.OPENROUTER_API_KEY = "  ";

    await expect(boot()).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("should use the real endpoint and key in real mode", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";

    const env = await boot();

    expect(env.OPENROUTER_API_KEY).toBe("sk-test");
    expect(env.OPENROUTER_BASE_URL).toBeUndefined();
  });
});
