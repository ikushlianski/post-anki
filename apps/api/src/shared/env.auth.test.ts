import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAVED = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...SAVED, DATABASE_URL: "postgres://x/y", LLM_MODE: "mock" };

  for (const key of ["RESEND_API_KEY", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "AUTH_EMAIL_FROM", "OWNER_EMAIL", "NODE_ENV"]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = SAVED;
});

async function boot() {
  const { loadEnv } = await import("./env.js");

  return loadEnv();
}

describe("web auth boot config", () => {
  it("should reject production with every auth variable empty because the auth secret is mandatory", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "";
    process.env.BETTER_AUTH_SECRET = "";
    process.env.BETTER_AUTH_URL = "";
    process.env.AUTH_EMAIL_FROM = "";

    await expect(boot()).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("should boot in production with only an auth secret and an owner email, no email provider", async () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "s".repeat(32);
    process.env.OWNER_EMAIL = "owner@example.com";

    const env = await boot();

    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.OWNER_EMAIL).toBe("owner@example.com");
  });

  it("should reject production with a too short auth secret even without an email key", async () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "short";

    await expect(boot()).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("should reject an owner email that is not an email address", async () => {
    process.env.OWNER_EMAIL = "not-an-email";

    await expect(boot()).rejects.toThrow("OWNER_EMAIL");
  });

  it("should treat an empty owner email as not set", async () => {
    process.env.OWNER_EMAIL = "  ";

    expect((await boot()).OWNER_EMAIL).toBeUndefined();
  });

  it("should let development boot without any auth variable", async () => {
    expect((await boot()).BETTER_AUTH_SECRET).toBeUndefined();
  });

  it("should still require the sender and public URL in production once an email key is set", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_key";
    process.env.BETTER_AUTH_SECRET = "s".repeat(32);

    await expect(boot()).rejects.toThrow("AUTH_EMAIL_FROM");
  });

  it("should reject production with an email key but no auth secret", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_key";
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.AUTH_EMAIL_FROM = "login@example.com";

    await expect(boot()).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("should reject a short auth secret even outside production", async () => {
    process.env.RESEND_API_KEY = "re_key";
    process.env.BETTER_AUTH_SECRET = "short";

    await expect(boot()).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("should accept production when the email key comes with secret, URL and sender", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_key";
    process.env.BETTER_AUTH_SECRET = "s".repeat(32);
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.AUTH_EMAIL_FROM = "login@example.com";

    expect((await boot()).RESEND_API_KEY).toBe("re_key");
  });

  it("should let development boot with an email key and a long enough secret only", async () => {
    process.env.RESEND_API_KEY = "re_key";
    process.env.BETTER_AUTH_SECRET = "s".repeat(32);

    expect((await boot()).BETTER_AUTH_URL).toBeUndefined();
  });
});
