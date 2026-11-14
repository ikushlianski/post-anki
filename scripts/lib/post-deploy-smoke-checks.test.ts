import { describe, expect, it, vi } from "vitest";

import {
  checkDailyPushRejectsAnonymous,
  checkPushAuth,
  checkWebhook,
  missingEnv,
  redact,
} from "./post-deploy-smoke-checks.mjs";

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const status = (code: number) => ({ ok: code < 400, status: code, json: async () => ({}) });

describe("missingEnv", () => {
  it("should list every unset variable so the operator fixes them in one pass", () => {
    expect(missingEnv({ SMOKE_API_URL: "x" })).toEqual(["SMOKE_BOT_URL", "TELEGRAM_BOT_TOKEN"]);
  });
});

describe("redact", () => {
  it("should never leak the bot token in an error message", () => {
    expect(redact("failed https://x/botSECRET/y", "SECRET")).toBe("failed https://x/bot[REDACTED]/y");
  });
});

describe("checkWebhook", () => {
  const args = { botUrl: "https://bot.example.com/", token: "T" };

  it("should pass when Telegram points at the bot's /telegram URL with no error", async () => {
    const fetchFn = vi.fn(async () => json({ ok: true, result: { url: "https://bot.example.com/telegram" } }));

    expect((await checkWebhook({ ...args, fetchFn })).ok).toBe(true);
  });

  it("should fail when the webhook points somewhere else", async () => {
    const fetchFn = vi.fn(async () => json({ ok: true, result: { url: "https://old.example.com/telegram" } }));

    expect((await checkWebhook({ ...args, fetchFn })).ok).toBe(false);
  });

  it("should fail when Telegram reports a delivery error", async () => {
    const fetchFn = vi.fn(async () =>
      json({ ok: true, result: { url: "https://bot.example.com/telegram", last_error_message: "403" } }),
    );

    expect((await checkWebhook({ ...args, fetchFn })).detail).toContain("403");
  });

  it("should redact the token when the request itself throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("boom https://api.telegram.org/botT/getWebhookInfo");
    });

    expect((await checkWebhook({ ...args, fetchFn })).detail).not.toContain("botT/");
  });
});

describe("checkPushAuth", () => {
  it("should pass when missing and wrong bearers both get 401, sending no real secret", async () => {
    const fetchFn = vi.fn(async () => status(401));
    const result = await checkPushAuth({ fetchFn, botUrl: "https://bot.example.com" });

    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe("https://bot.example.com/push");
  });

  it("should fail when a wrong bearer is accepted", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(status(401)).mockResolvedValueOnce(status(200));

    expect((await checkPushAuth({ fetchFn, botUrl: "https://b" })).detail).toContain("wrong bearer");
  });
});

describe("checkDailyPushRejectsAnonymous", () => {
  it("should pass when the API rejects an unauthenticated request", async () => {
    const fetchFn = vi.fn(async () => status(401));

    expect((await checkDailyPushRejectsAnonymous({ fetchFn, apiUrl: "https://api.example.com" })).ok).toBe(true);
  });

  it("should fail when the API serves daily-push without credentials", async () => {
    const fetchFn = vi.fn(async () => status(200));

    expect((await checkDailyPushRejectsAnonymous({ fetchFn, apiUrl: "https://api.example.com" })).ok).toBe(false);
  });
});
