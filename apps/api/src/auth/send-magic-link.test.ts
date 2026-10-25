import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn() } }));

import type { AuthEmail } from "./auth-email.js";
import { log } from "../shared/log.js";

const { createMagicLinkSender, UNKNOWN_EMAIL_DELAY_MS } = await import("./send-magic-link.js");

function setup(known: boolean) {
  const sendEmail = vi.fn(async (_email: AuthEmail) => undefined);
  const wait = vi.fn(async () => undefined);
  const send = createMagicLinkSender({ userExists: async () => known, sendEmail, wait });

  return { send, sendEmail, wait };
}

describe("magic link sender", () => {
  it("should email a known owner exactly one link", async () => {
    const { send, sendEmail, wait } = setup(true);

    await send({ email: "Owner@Example.com", url: "https://app.example.com/verify?token=abc" });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: "owner@example.com" });
    expect(wait).not.toHaveBeenCalled();
  });

  it("should send nothing for an unknown email yet resolve after a delay so the response looks the same", async () => {
    const { send, sendEmail, wait } = setup(false);

    await expect(send({ email: "stranger@example.com", url: "https://app.example.com/verify?token=abc" })).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledWith(UNKNOWN_EMAIL_DELAY_MS);
  });

  it("should answer a known owner normally when the email provider fails, logging only status and a hashed email", async () => {
    const { send, sendEmail } = setup(true);

    sendEmail.mockRejectedValueOnce(new Error("auth_email_failed_502"));

    await expect(send({ email: "owner@example.com", url: "https://app.example.com/verify?token=secret-token" })).resolves.toBeUndefined();

    const logged = JSON.stringify(vi.mocked(log.error).mock.calls);

    expect(logged).toContain("auth_email_failed_502");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("owner@example.com");
  });

  it("should trigger the expired-row purge on every sign-in request", async () => {
    const purgeExpired = vi.fn();
    const send = createMagicLinkSender({ userExists: async () => true, sendEmail: async () => undefined, wait: async () => undefined, purgeExpired });

    await send({ email: "owner@example.com", url: "https://app.example.com/verify" });

    expect(purgeExpired).toHaveBeenCalledTimes(1);
  });
});
