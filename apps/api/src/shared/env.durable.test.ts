import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = { DATABASE_URL: "postgres://x/y", OPENROUTER_API_KEY: "key" };
const SAVED = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...SAVED, ...BASE };
  delete process.env.DURABLE_EXTRACTION;
  delete process.env.DURABLE_EXTRACTION_TIMEOUT_MS;
  delete process.env.DURABLE_EXTRACTION_STALE_MS;
  delete process.env.DBOS_APPLICATION_VERSION;
  delete process.env.DBOS_EXECUTOR_ID;
  delete process.env.INNGEST_DEV;
  delete process.env.DURABLE_CARDS;
  delete process.env.DURABLE_COURSE_JOBS;
  delete process.env.DURABLE_BACKGROUND_JOBS;
  delete process.env.DURABLE_EXTRACTION_ENGINE;
  delete process.env.INNGEST_SIGNING_KEY;
  delete process.env.INNGEST_EVENT_KEY;
  delete process.env.INNGEST_SIGNING_KEY_FALLBACK;
});

afterEach(() => {
  process.env = SAVED;
});

async function boot() {
  const { loadEnv } = await import("./env.js");

  return loadEnv();
}

describe("durable extraction environment", () => {
  it.each(["", "yes", "garbage", "TRUE", "0", "false", " 1"])(
    "should boot and keep the pilot off when DURABLE_EXTRACTION is %j",
    async (value) => {
      process.env.DURABLE_EXTRACTION = value;
      const { parseDurableFlag } = await import("../knowledge-bit/durable-extraction.config.js");

      expect(() => boot()).not.toThrow();
      expect(parseDurableFlag((await boot()).DURABLE_EXTRACTION)).toBe(false);
    },
  );

  it.each(["1", "true"])("should turn the pilot on only for %j", async (value) => {
    process.env.DURABLE_EXTRACTION = value;
    process.env.INNGEST_DEV = "1";
    const { parseDurableFlag } = await import("../knowledge-bit/durable-extraction.config.js");

    expect(parseDurableFlag((await boot()).DURABLE_EXTRACTION)).toBe(true);
  });

  it.each(["", "abc", "0", "-5", "1.5", "  "])(
    "should boot and use the default limits when the timeout and stale values are %j",
    async (value) => {
      process.env.DURABLE_EXTRACTION_TIMEOUT_MS = value;
      process.env.DURABLE_EXTRACTION_STALE_MS = value;
      process.env.DBOS_APPLICATION_VERSION = value;
      process.env.DBOS_EXECUTOR_ID = value;
      const config = await import("../knowledge-bit/durable-extraction.config.js");
      const env = await boot();

      expect(config.durableTimeoutMs(env.DURABLE_EXTRACTION_TIMEOUT_MS)).toBe(10_000);
      expect(config.durableStaleMs(env.DURABLE_EXTRACTION_STALE_MS)).toBe(30 * 60 * 1000);
    },
  );

  it("should accept valid limits", async () => {
    process.env.DURABLE_EXTRACTION_TIMEOUT_MS = "2500";
    process.env.DURABLE_EXTRACTION_STALE_MS = "2400000";
    const config = await import("../knowledge-bit/durable-extraction.config.js");
    const env = await boot();

    expect(config.durableTimeoutMs(env.DURABLE_EXTRACTION_TIMEOUT_MS)).toBe(2500);
    expect(config.durableStaleMs(env.DURABLE_EXTRACTION_STALE_MS)).toBe(2_400_000);
  });
});

describe("inngest signing key requirement", () => {
  it.each([undefined, "", "0", "garbage"])(
    "should boot without a signing key when DURABLE_EXTRACTION is %j",
    async (value) => {
      if (value !== undefined) {
        process.env.DURABLE_EXTRACTION = value;
      }

      await expect(boot()).resolves.toBeDefined();
    },
  );

  it("should boot without a signing key in local dev with INNGEST_DEV=1", async () => {
    process.env.DURABLE_EXTRACTION = "1";
    process.env.INNGEST_DEV = "1";

    await expect(boot()).resolves.toBeDefined();
  });

  it.each(["1", "true"])(
    "should refuse to boot without a signing key when DURABLE_EXTRACTION is %j outside local dev",
    async (value) => {
      process.env.DURABLE_EXTRACTION = value;

      await expect(boot()).rejects.toThrow(/INNGEST_SIGNING_KEY/);
    },
  );

  it("should refuse a blank signing key outside local dev", async () => {
    process.env.DURABLE_EXTRACTION = "1";
    process.env.INNGEST_SIGNING_KEY = "   ";

    await expect(boot()).rejects.toThrow(/INNGEST_SIGNING_KEY/);
  });

  it("should boot with a signing key and an optional fallback key", async () => {
    process.env.DURABLE_EXTRACTION = "1";
    process.env.INNGEST_SIGNING_KEY = "signkey-test-abc123";
    process.env.INNGEST_EVENT_KEY = "event-test-abc123";
    process.env.INNGEST_SIGNING_KEY_FALLBACK = "signkey-test-old456";

    const env = await boot();

    expect(env.INNGEST_SIGNING_KEY_FALLBACK).toBe("signkey-test-old456");
  });

  it("should not print secret values when the check fails", async () => {
    process.env.DURABLE_EXTRACTION = "1";
    process.env.INNGEST_SIGNING_KEY_FALLBACK = "signkey-test-old456";

    await expect(boot()).rejects.toThrow(/^((?!signkey-test-old456).)*$/s);
  });
});

describe("background jobs flag and event key", () => {
  it("should demand the signing key when only DURABLE_BACKGROUND_JOBS is on", async () => {
    process.env.DURABLE_BACKGROUND_JOBS = "1";
    process.env.INNGEST_EVENT_KEY = "event-test-abc123";

    await expect(boot()).rejects.toThrow(/INNGEST_SIGNING_KEY/);
  });

  it.each(["DURABLE_EXTRACTION", "DURABLE_CARDS", "DURABLE_COURSE_JOBS", "DURABLE_BACKGROUND_JOBS"])(
    "should refuse to boot without an event key when %s is on outside local dev",
    async (flag) => {
      process.env[flag] = "1";
      process.env.INNGEST_SIGNING_KEY = "signkey-test-abc123";

      await expect(boot()).rejects.toThrow(/INNGEST_EVENT_KEY/);
    },
  );

  it("should boot when both keys are set and every flag is on", async () => {
    process.env.DURABLE_EXTRACTION = "1";
    process.env.DURABLE_CARDS = "1";
    process.env.DURABLE_COURSE_JOBS = "1";
    process.env.DURABLE_BACKGROUND_JOBS = "1";
    process.env.INNGEST_SIGNING_KEY = "signkey-test-abc123";
    process.env.INNGEST_EVENT_KEY = "event-test-abc123";

    await expect(boot()).resolves.toBeDefined();
  });

  it("should boot without any key when INNGEST_DEV=1 and every flag is on", async () => {
    process.env.DURABLE_EXTRACTION = "1";
    process.env.DURABLE_CARDS = "1";
    process.env.DURABLE_COURSE_JOBS = "1";
    process.env.DURABLE_BACKGROUND_JOBS = "1";
    process.env.INNGEST_DEV = "1";

    await expect(boot()).resolves.toBeDefined();
  });

  it("should not require an event key when every flag is off", async () => {
    await expect(boot()).resolves.toBeDefined();
  });

  it("should not print secret values when the event key check fails", async () => {
    process.env.DURABLE_CARDS = "1";
    process.env.INNGEST_SIGNING_KEY = "signkey-test-secret789";

    await expect(boot()).rejects.toThrow(/^((?!signkey-test-secret789).)*$/s);
  });
});

describe("durable extraction engine default", () => {
  it("should use inngest when DURABLE_EXTRACTION_ENGINE is unset", async () => {
    expect((await boot()).DURABLE_EXTRACTION_ENGINE).toBe("inngest");
  });

  it("should keep an explicit dbos choice", async () => {
    process.env.DURABLE_EXTRACTION_ENGINE = "dbos";

    expect((await boot()).DURABLE_EXTRACTION_ENGINE).toBe("dbos");
  });
});
